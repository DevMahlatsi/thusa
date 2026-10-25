import type { Language, MessageKind } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  MessageRefusedError,
  messagingProviderName,
  renderMessage,
  sendRendered,
  sendWhatsApp,
  whatsAppConfig,
  type Channel,
  type ProviderName,
  type SendResult,
} from "@/messaging/adapter";
import type { FeeParams, FeeTemplateKey } from "@/messaging/templates";
import { isWhatsAppLanguage, renderWhatsApp } from "@/messaging/templates/whatsapp";
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
// WhatsApp carries a message when it's switched on and has an approved template in the parent's
// language (English and isiZulu) and the fee has a payment page. Everything else goes by SMS when SMS
// is switched on.
//
// A message is only handed to a provider when one is configured and the business isn't the judges'
// shared demo account: the demo's parents have made-up numbers, and nobody should be able to message a
// real person from it. Those messages are recorded as NOT_DELIVERED, with the full text. The one
// exception is the demo's "Send to my WhatsApp" (src/lib/whatsapp-sample.ts), which only ever goes to
// the number the judge typed in.

const TEMPLATE: Record<MessageKind, FeeTemplateKey> = {
  PAYMENT_REQUEST: "payment_request",
  REMINDER: "payment_reminder",
  BALANCE_REQUEST: "balance_request",
};

// Short codes for why a message didn't go out. The page turns them into words; no provider text is kept.
export const MESSAGE_NOTES = {
  demo_account: "Demo account: shown here, not sent",
  demo_sample: "Demo: sent to the WhatsApp number typed in, not to the parent",
  messaging_off: "Messaging isn't switched on yet: shown here, not sent",
  whatsapp_language: "WhatsApp has no template in this language, and SMS isn't switched on yet: shown here, not sent",
  whatsapp_no_link: "WhatsApp needs a payment page link, and SMS isn't switched on yet: shown here, not sent",
  dev_outbox: "Development: shown in the dev outbox, not sent",
  provider_refused: "The provider refused it",
  provider_error: "The provider couldn't be reached",
} as const;

export type MessageNote = keyof typeof MESSAGE_NOTES;

type MessageRequest = {
  businessId: string;
  collectionId: string;
  kind: MessageKind;
  dedupeKey: string;
  // Null when Thusa sends it on its own (the daily job).
  sentByUserId: string | null;
  // The demo's "Send to my WhatsApp": this number (E.164) gets the message instead of the parent, on
  // WhatsApp only. Refused for any business but the demo's.
  sampleTo?: string;
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

/** The demo sample's language: the parent's when WhatsApp has it, otherwise English. */
const sampleLanguage = (language: Language): Language => (isWhatsAppLanguage(language) ? language : "en");

/**
 * The demo sample for a payment request, as it would go out, or null if WhatsApp can't carry it. Needs no
 * WhatsApp setup: with WhatsApp off, the demo shows it as a preview.
 */
export async function whatsAppSampleFor(businessId: string, collectionId: string) {
  const { params, language } = await feeFor(businessId, collectionId, "PAYMENT_REQUEST");
  return renderWhatsApp(sampleLanguage(language), "payment_request", params);
}

/**
 * Writes the message for one collection and sends it if it should be sent. Returns the stored message;
 * `created` is false when the dedupe key already had one (nothing new was sent). A FAILED message under
 * the same key is tried again. Provider failures are recorded on the message, not thrown.
 */
export async function messageParent(req: MessageRequest) {
  const { collection, params, language } = await feeFor(req.businessId, req.collectionId, req.kind);
  const template = TEMPLATE[req.kind];
  const demo = await isDemoBusiness(req.businessId);
  const whatsAppOn = whatsAppConfig() !== null;

  if (req.sampleTo) {
    if (!demo) throw new HttpError(404, "Payment request not found.");
    const to = req.sampleTo;
    const lang = sampleLanguage(language);
    const whatsApp = whatsAppOn ? renderWhatsApp(lang, template, params) : null;
    if (!whatsApp) throw new HttpError(409, "This fee can't be sent on WhatsApp.");
    return record(
      req,
      { template, language: lang, channel: "whatsapp", phone: to, body: whatsApp.text },
      { provider: "meta", send: () => sendWhatsApp(to, whatsApp), sentNote: "demo_sample" },
    );
  }

  const phone = payerPhone(collection.payer);
  const whatsApp = whatsAppOn ? renderWhatsApp(language, template, params) : null;
  if (whatsApp) {
    return record(
      req,
      { template, language, channel: "whatsapp", phone, body: whatsApp.text },
      demo ? { unsent: "demo_account" } : { provider: "meta", send: () => sendWhatsApp(phone, whatsApp) },
    );
  }

  const body = renderMessage(language, template, params);
  const smsProvider = messagingProviderName();
  let delivery: Delivery;
  if (demo) delivery = { unsent: "demo_account" };
  else if (smsProvider) {
    delivery = { provider: smsProvider, send: () => sendRendered({ to: phone, channel: "sms", template, body }) };
  } else if (whatsAppOn) delivery = { unsent: isWhatsAppLanguage(language) ? "whatsapp_no_link" : "whatsapp_language" };
  else delivery = { unsent: "messaging_off" };
  return record(req, { template, language, channel: "sms", phone, body }, delivery);
}

type Draft = { template: FeeTemplateKey; language: Language; channel: Channel; phone: string; body: string };

// Either how to send it, or why it's only recorded.
type Delivery =
  | { provider: ProviderName; send: () => Promise<SendResult>; sentNote?: MessageNote }
  | { unsent: MessageNote };

async function record(req: MessageRequest, draft: Draft, delivery: Delivery) {
  const fields = {
    kind: req.kind,
    template: draft.template,
    language: draft.language,
    channel: draft.channel,
    phoneMasked: mask(draft.phone),
    body: draft.body,
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
  if ("unsent" in delivery) outcome = { status: "NOT_DELIVERED", note: delivery.unsent };
  else {
    try {
      const sent = await delivery.send();
      outcome =
        sent.provider === "outbox"
          ? { status: "NOT_DELIVERED", note: "dev_outbox", provider: sent.provider }
          : { status: "SENT", note: delivery.sentNote ?? null, provider: sent.provider, providerMessageId: sent.providerMessageId };
    } catch (err) {
      const refused = err instanceof MessageRefusedError;
      logger.error("messaging.send_failed", { messageId: message.id, provider: delivery.provider, refused, error: err });
      outcome = { status: "FAILED", note: refused ? "provider_refused" : "provider_error", provider: delivery.provider };
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
  logger.info("messaging.recorded", { messageId: done.id, kind: req.kind, channel: done.channel, status: done.status, note: done.note });
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
