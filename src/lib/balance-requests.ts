import { randomUUID } from "node:crypto";
import { paymentProvider, type PaymentProvider } from "@/payments/adapter";
import { audit } from "./audit";
import { freshReference, SENDING_TIMEOUT_MS, type Ctx } from "./collections";
import { db } from "./db";
import { HttpError } from "./http";
import { logger } from "./logger";
import { messageParent } from "./parent-messages";

// Part-payments. Payment links are for a fixed amount, so when a parent has paid part of a fee the rest
// needs a link of its own: a balance request. The balance is worked out here from the collection
// (amountCents − paidCents); nothing in the request names an amount. Payments on the balance link are
// credited to the same collection as new ledger entries (src/lib/payment-webhooks.ts), so the
// collection becomes PAID once the ledger adds up.

function findBalanceRequest(businessId: string, collectionId: string, forPaidCents: number) {
  return db().balanceRequest.findFirst({ where: { businessId, collectionId, forPaidCents } });
}

/**
 * Asks the provider for a payment link for what's still owed on a part-paid collection, and messages it
 * to the parent. Safe to repeat: while the paid amount hasn't changed, it returns the same request.
 */
export async function requestBalance(ctx: Ctx, collectionId: string) {
  const collection = await db().collection.findFirst({
    where: { id: collectionId, businessId: ctx.businessId, payer: { archivedAt: null } },
    include: { payer: { select: { parentName: true } } },
  });
  if (!collection) throw new HttpError(404, "Payment request not found.");
  if (collection.status !== "PARTIAL") throw new HttpError(409, "Only a part-paid fee has a balance to request.");
  const amountCents = collection.amountCents - collection.paidCents;
  if (amountCents <= 0) throw new HttpError(409, "Nothing is owed on this fee.");

  let provider: PaymentProvider;
  try {
    provider = paymentProvider();
  } catch (err) {
    logger.error("payments.not_configured", { error: err });
    throw new HttpError(503, "Payment requests aren't switched on yet.");
  }

  let balance = await findBalanceRequest(ctx.businessId, collectionId, collection.paidCents);
  if (!balance) {
    // Skipping duplicates makes a double click harmless: both find the one row afterwards.
    await db().balanceRequest.createMany({
      data: {
        businessId: ctx.businessId,
        collectionId,
        forPaidCents: collection.paidCents,
        amountCents,
        reference: await freshReference(),
        idempotencyKey: randomUUID(),
        provider: provider.name,
      },
      skipDuplicates: true,
    });
    balance = await findBalanceRequest(ctx.businessId, collectionId, collection.paidCents);
    if (!balance) throw new Error("Could not create the balance request");
  }
  if (balance.providerRequestId) return { balanceRequest: balance, sent: false };

  // Claim it, so two clicks at once can't both reach the provider.
  const claimed = await db().balanceRequest.updateMany({
    where: {
      id: balance.id,
      businessId: ctx.businessId,
      providerRequestId: null,
      OR: [{ sendingSince: null }, { sendingSince: { lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } }],
    },
    data: { sendingSince: new Date() },
  });
  if (claimed.count === 0) {
    const current = await findBalanceRequest(ctx.businessId, collectionId, collection.paidCents);
    if (current?.providerRequestId) return { balanceRequest: current, sent: false };
    throw new HttpError(409, "This request is already being sent. Refresh in a moment.");
  }

  let result;
  try {
    result = await provider.createPaymentRequest({
      amountCents: balance.amountCents,
      reference: balance.reference,
      idempotencyKey: balance.idempotencyKey,
      payerName: collection.payer.parentName,
    });
  } catch (err) {
    await db().balanceRequest.updateMany({
      where: { id: balance.id, businessId: ctx.businessId },
      data: { sendingSince: null },
    });
    logger.error("payments.balance_request_failed", { balanceRequestId: balance.id, provider: provider.name, error: err });
    throw new HttpError(502, "The payment provider didn't accept the request. Please try again.");
  }

  const sent = await db().balanceRequest.update({
    where: { id: balance.id, businessId: ctx.businessId },
    data: {
      provider: provider.name,
      providerRequestId: result.providerRequestId,
      paymentUrl: result.paymentUrl,
      requestedAt: new Date(),
      requestedByUserId: ctx.userId,
      sendingSince: null,
    },
  });
  await audit({
    action: "collection.balance_requested",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: {
      collectionId,
      balanceRequestId: sent.id,
      reference: sent.reference,
      amountCents: sent.amountCents,
      provider: provider.name,
    },
  });
  try {
    await messageParent({
      businessId: ctx.businessId,
      collectionId,
      kind: "BALANCE_REQUEST",
      dedupeKey: `balance:${sent.id}`,
      sentByUserId: ctx.userId,
    });
  } catch (err) {
    logger.error("messaging.balance_message_failed", { balanceRequestId: sent.id, error: err });
  }
  return { balanceRequest: sent, sent: true };
}

/** Safe for API responses: no idempotency key or provider ids. */
export function toBalanceRequestDto(b: NonNullable<Awaited<ReturnType<typeof findBalanceRequest>>>) {
  return {
    id: b.id,
    collectionId: b.collectionId,
    amountCents: b.amountCents,
    reference: b.reference,
    paymentUrl: b.paymentUrl,
    requestedAt: b.requestedAt?.toISOString() ?? null,
  };
}
