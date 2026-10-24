import type { MessageKind } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { MessageRefusedError, messagingProviderName, renderMessage, sendRendered } from "@/messaging/adapter";
import type { FeeParams, TemplateKey } from "@/messaging/templates";
import { paymentLink } from "@/payments/adapter";
import { demoLogin } from "./auth/demo";
import { db } from "./db";
import { HttpError } from "./http";
import { logger, mask } from "./logger";
import { payerPhone } from "./payers";

// Messages to parents about their fees. Each one is a fixed template, recorded in the Message table
// before it is sent, under a dedupe key, so a retry, a double click or a re-run job never messages a
// parent twice. The owner sees every message on /messages, delivered or not.
//
// A message is only handed to the SMS provider when one is configured and the business isn't the
// judges' shared demo account: the demo's parents have made-up numbers, and nobody should be able to
// message a real person from it. Those messages are recorded as NOT_DELIVERED, with the full text.

const TEMPLATE: Record<MessageKind, Exclude<TemplateKey, "otp">> = {
  PAYMENT_REQUEST: "payment_request",
  REMINDER: "payment_reminder",
  BALANCE_REQUEST: "balance_request",
};

// Short codes for why a message didn't go out. The page turns them into words; no provider text is kept.
export const MESSAGE_NOTES = {
  demo_account: "Demo account: shown here, not sent",
  messaging_off: "SMS isn't switched on yet: shown here, not sent",
  dev_outbox: "Development: shown in the dev outbox, not sent",
  provider_refused: "The SMS provider refused it",
  provider_error: "The SMS provider couldn't be reached",
} as const;

export type MessageNote = keyof typeof MESSAGE_NOTES;

type MessageRequest = {
  businessId: string;
  collectionId: string;
  kind: MessageKind;
  dedupeKey: string;
  // Null when Thusa sends it on its own (the daily job).
  sentByUserId: string | null;
};

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** True for the business of the judges' demo login (DEMO_PHONE). Its messages are never delivered. */
export async function isDemoBusiness(businessId: string): Promise<boolean> {
  const demo = demoLogin();
  if (!demo) return false;
  const user = await db().user.findUnique({ where: { phoneE164: demo.phoneE164 }, select: { businessId: true } });
  return user?.businessId === businessId;
}

/** What the message is about: the collection, or for a balance (and a reminder after a part-payment) its balance request. */
async function feeFor(businessId: string, collectionId: string, kind: MessageKind) {
  const collection = await db().collection.findFirst({
    where: { id: collectionId, businessId },
    include: { payer: true, business: { select: { name: true, defaultLanguage: true } } },
  });
  if (!collection) throw new HttpError(404, "Payment request not found.");

  const owesBalance = kind === "BALANCE_REQUEST" || (kind === "REMINDER" && collection.paidCents > 0);
  const balance = owesBalance
    ? await db().balanceRequest.findFirst({
        where: { businessId, collectionId, forPaidCents: collection.paidCents, providerRequestId: { not: null } },
      })
    : null;
  if (owesBalance && !balance) throw new HttpError(409, "Request the balance first, then remind the parent about it.");

  const params: FeeParams & { paidCents: number } = {
    business: collection.business.name,
    child: collection.payer.childName,
    amountCents: balance?.amountCents ?? collection.amountCents,
    paidCents: collection.paidCents,
    dueDate: collection.dueDate.toISOString().slice(0, 10),
    reference: balance?.reference ?? collection.reference,
    link: paymentLink(balance ? balance.paymentUrl : collection.paymentUrl),
  };
  return { collection, params, language: collection.payer.language ?? collection.business.defaultLanguage };
}

/**
 * Writes the message for one collection and sends it if it should be sent. Returns the stored message;
 * `created` is false when the dedupe key already had one (nothing new was sent). A FAILED message under
 * the same key is tried again. Provider failures are recorded on the message, not thrown.
 */
export async function messageParent(req: MessageRequest) {
  const { collection, params, language } = await feeFor(req.businessId, req.collectionId, req.kind);
  const template = TEMPLATE[req.kind];
  const body = renderMessage(language, template, params);
  const phone = payerPhone(collection.payer);
  const fields = {
    kind: req.kind,
    template,
    language,
    channel: "sms",
    phoneMasked: mask(phone),
    body,
    status: "QUEUED" as const,
    provider: null,
    providerMessageId: null,
    note: null,
    sentByUserId: req.sentByUserId,
  };

  let message;
  try {
    message = await db().message.create({
      data: { ...fields, businessId: req.businessId, collectionId: req.collectionId, dedupeKey: req.dedupeKey },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await db().message.findUniqueOrThrow({
      where: { businessId_dedupeKey: { businessId: req.businessId, dedupeKey: req.dedupeKey } },
    });
    // Only a failed message is tried again, and only by whoever claims it first.
    const claimed = await db().message.updateMany({
      where: { id: existing.id, businessId: req.businessId, status: "FAILED" },
      data: fields,
    });
    if (claimed.count === 0) return { message: existing, created: false };
    message = { ...existing, ...fields };
  }

  let outcome: { status: "SENT" | "NOT_DELIVERED" | "FAILED"; note: MessageNote | null; provider?: string; providerMessageId?: string | null };
  const providerName = messagingProviderName();
  if (await isDemoBusiness(req.businessId)) outcome = { status: "NOT_DELIVERED", note: "demo_account" };
  else if (!providerName) outcome = { status: "NOT_DELIVERED", note: "messaging_off" };
  else {
    try {
      const sent = await sendRendered({ to: phone, channel: "sms", template, body });
      outcome =
        sent.provider === "outbox"
          ? { status: "NOT_DELIVERED", note: "dev_outbox", provider: sent.provider }
          : { status: "SENT", note: null, provider: sent.provider, providerMessageId: sent.providerMessageId };
    } catch (err) {
      const refused = err instanceof MessageRefusedError;
      logger.error("messaging.send_failed", { messageId: message.id, provider: providerName, refused, error: err });
      outcome = { status: "FAILED", note: refused ? "provider_refused" : "provider_error", provider: providerName };
    }
  }

  const done = await db().message.update({
    where: { id: message.id, businessId: req.businessId },
    data: {
      status: outcome.status,
      note: outcome.note,
      provider: outcome.provider ?? null,
      providerMessageId: outcome.providerMessageId ?? null,
    },
  });
  logger.info("messaging.recorded", { messageId: done.id, kind: req.kind, status: done.status, note: done.note });
  return { message: done, created: true };
}

/** The business's latest messages, newest first, for /messages. Phones are already masked. */
export async function listMessages(businessId: string, take = 50) {
  return db().message.findMany({
    where: { businessId },
    include: { collection: { select: { reference: true, dueDate: true, payer: { select: { parentName: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}
