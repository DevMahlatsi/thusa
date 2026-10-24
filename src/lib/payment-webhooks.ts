import { paymentProvider, WebhookSignatureError, type PaymentProvider } from "@/payments/adapter";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { db } from "./db";
import { logger } from "./logger";

// Provider webhooks: verify the signature first, then dedupe on the delivery id, then process. A
// collection only becomes PAID from the provider's own answer to confirmPayment, never from the
// webhook body. Money is recorded as an append-only ledger entry; the collection's paidCents is the
// sum of its entries. The delivery id is recorded in the same transaction as the ledger entry, so a
// delivery that failed half-way is processed in full when it's retried or replayed.

export type WebhookResult = { status: number; body: { ok: boolean; outcome: string } };

const result = (status: number, outcome: string): WebhookResult => ({ status, body: { ok: status < 300, outcome } });

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export async function handlePaymentWebhook(
  rawBody: string,
  headers: Headers,
  provider?: PaymentProvider,
): Promise<WebhookResult> {
  try {
    provider ??= paymentProvider();
  } catch (err) {
    logger.error("webhooks.not_configured", { error: err });
    return result(503, "not_configured");
  }

  // 1. Signature, before anything in the body is read.
  let event;
  try {
    event = provider.parseWebhook(rawBody, headers);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      logger.warn("webhooks.bad_signature", { provider: provider.name, reason: err.message });
      return result(401, "bad_signature");
    }
    logger.error("webhooks.not_configured", { provider: provider.name, error: err });
    return result(503, "not_configured");
  }

  // 2. Dedupe.
  const seen = await db().webhookEvent.findUnique({
    where: { provider_eventId: { provider: provider.name, eventId: event.eventId } },
  });
  if (seen) return result(200, "duplicate");

  // Other event types, and other apps' links on a shared provider account, are acknowledged and left alone.
  // Not recorded: nothing was processed.
  if (!event.paidRequestId) return result(200, "ignored");
  // No session here: the signed provider id finds the collection, and its businessId scopes the rest.
  const collection = await db().collection.findUnique({
    where: { provider_providerRequestId: { provider: provider.name, providerRequestId: event.paidRequestId } },
  });
  if (!collection) {
    logger.info("webhooks.unknown_request", { provider: provider.name, eventId: event.eventId });
    return result(200, "ignored");
  }

  // 3. Reconfirm with the provider. A failure or "not paid yet" answers 503 so the provider retries.
  let payment;
  try {
    payment = await provider.confirmPayment(event.paidRequestId);
  } catch (err) {
    logger.error("webhooks.confirm_failed", { provider: provider.name, collectionId: collection.id, error: err });
    return result(503, "confirm_failed");
  }
  if (!payment) {
    logger.warn("webhooks.not_paid_at_provider", { provider: provider.name, collectionId: collection.id });
    return result(503, "not_paid_yet");
  }
  if (payment.reference !== collection.reference || payment.amountCents <= 0) {
    // Retrying won't change this. Leave the collection PENDING for a person to look at.
    logger.error("webhooks.payment_mismatch", {
      provider: provider.name,
      collectionId: collection.id,
      referenceMatches: payment.reference === collection.reference,
      amountCents: payment.amountCents,
    });
    return result(200, "mismatch");
  }

  // 4. Ledger entry, new paid total and status, and the delivery id, all or nothing.
  const { businessId } = collection;
  let updated;
  let credited = false;
  try {
    updated = await db().$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { provider: provider.name, eventId: event.eventId } });
      // A second delivery of the same payment (a different delivery id) must not credit it twice.
      const entry = await tx.ledgerEntry.createMany({
        data: {
          businessId,
          collectionId: collection.id,
          kind: "PAYMENT",
          amountCents: payment.amountCents,
          provider: provider.name,
          providerPaymentId: payment.providerPaymentId,
          occurredAt: payment.paidAt,
        },
        skipDuplicates: true,
      });
      credited = entry.count === 1;
      const total = await tx.ledgerEntry.aggregate({
        where: { businessId, collectionId: collection.id },
        _sum: { amountCents: true },
      });
      const paidCents = total._sum.amountCents ?? 0;
      const paidInFull = paidCents >= collection.amountCents;
      return tx.collection.update({
        where: { id_businessId: { id: collection.id, businessId } },
        data: {
          paidCents,
          status: paidInFull ? "PAID" : paidCents > 0 ? "PARTIAL" : "PENDING",
          paidAt: paidInFull ? (collection.paidAt ?? payment.paidAt) : null,
        },
      });
    });
  } catch (err) {
    // The same delivery arriving twice at once: the other one recorded it.
    if (isUniqueViolation(err)) return result(200, "duplicate");
    throw err;
  }

  if (credited) {
    await audit({
      action: "collection.paid",
      businessId,
      metadata: {
        collectionId: collection.id,
        reference: collection.reference,
        amountCents: payment.amountCents,
        paidCents: updated.paidCents,
        status: updated.status,
        provider: provider.name,
      },
    });
  }
  logger.info("webhooks.processed", {
    provider: provider.name,
    collectionId: collection.id,
    status: updated.status,
    credited,
  });
  return result(200, credited ? "processed" : "already_credited");
}
