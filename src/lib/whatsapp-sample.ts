import type { Prisma } from "@/generated/prisma/client";
import { whatsAppConfig, whatsAppEnabled } from "@/messaging/adapter";
import { audit } from "./audit";
import { hmac } from "./auth/crypto";
import { db } from "./db";
import { HttpError } from "./http";
import { isDemoBusiness, messageParent, whatsAppSampleFor } from "./parent-messages";
import { todayInSa } from "./payers";

// The demo's "Send to my WhatsApp". The demo's parents have made-up numbers and never get messages, so a
// judge who wants to see what a parent gets types their own number, agrees to one message, and gets this
// fee's payment request on WhatsApp, with its real (test-mode) payment page.
//
// Until WhatsApp is switched on (Meta approves the templates and the number), the page is a preview: the
// exact message, with its real Pay now link, and nothing is sent.
//
// Only for the demo business, only payment requests that are sent and unpaid, only to the number typed in.
// Thusa keeps the number masked (••••4567) on the message and a keyed hash in its dedupe key, nothing
// else, and never messages it again. Limits keep a shared, public demo from running up Meta's bill.

export const SAMPLE_LIMITS = {
  // One per fee per number per day (the dedupe key), and this many fees per number per day.
  perPhoneDay: 3,
  perIpDay: 10,
  // All judges together, per demo business per SA day (the demo resets every morning).
  perDemoDay: 60,
};

const tooMany = () => new HttpError(429, "That's the most WhatsApp samples for today. Please try again tomorrow.");

type Ctx = { userId: string; businessId: string };
type Fee = { providerRequestId: string | null; paymentUrl: string | null; status: string };

/** Why this fee can't be sent as a sample, or null if it can. */
function whyNot(fee: Fee): string | null {
  if (!fee.providerRequestId || !fee.paymentUrl) return "Send the payment request first.";
  if (fee.status !== "PENDING") return "Pick a fee that hasn't been paid yet.";
  return null;
}

const findFee = (businessId: string, collectionId: string) =>
  db().collection.findFirst({
    where: { id: collectionId, businessId, payer: { archivedAt: null } },
    include: { payer: { select: { parentName: true, childName: true } } },
  });

/**
 * For the sample page: the fee, the message exactly as it would go out (or why it can't), and whether it
 * can be sent. With WhatsApp off it's a preview only. Null outside the demo, or for a fee that isn't this
 * business's.
 */
export async function getWhatsAppSample(businessId: string, collectionId: string) {
  if (!(await isDemoBusiness(businessId))) return null;
  const fee = await findFee(businessId, collectionId);
  if (!fee) return null;
  const blocked = whyNot(fee);
  const message = blocked ? null : await whatsAppSampleFor(businessId, collectionId);
  return {
    parentName: fee.payer.parentName,
    childName: fee.payer.childName,
    amountCents: fee.amountCents,
    dueDate: fee.dueDate.toISOString().slice(0, 10),
    reference: fee.reference,
    problem: blocked ?? (message ? null : "This fee can't be sent on WhatsApp."),
    message: message ? { parts: message.parts, text: message.text } : null,
    canSend: whatsAppEnabled(),
  };
}

/** Sends one fee's payment request to the judge's WhatsApp number. `phoneE164` is already a checked SA mobile. */
export async function sendWhatsAppSample(ctx: Ctx, collectionId: string, phoneE164: string, ip: string, now = new Date()) {
  // Same answer as a collection that isn't there: a real business has no such thing.
  if (!(await isDemoBusiness(ctx.businessId))) throw new HttpError(404, "Payment request not found.");
  if (!whatsAppConfig()) throw new HttpError(503, "WhatsApp isn't switched on yet.");

  const fee = await findFee(ctx.businessId, collectionId);
  if (!fee) throw new HttpError(404, "Payment request not found.");
  const blocked = whyNot(fee);
  if (blocked) throw new HttpError(409, blocked);

  // Keyed hashes, so the dedupe key never holds the number or the address.
  const day = todayInSa(now);
  const phoneKey = hmac(`sample-phone:${phoneE164}`).slice(0, 24);
  const ipKey = hmac(`ip:${ip}`).slice(0, 24);
  const prefix = `sample:${day}:`;
  const count = (where: Prisma.MessageWhereInput) => db().message.count({ where: { ...where, businessId: ctx.businessId } });
  const [demoDay, phoneDay, ipDay] = await Promise.all([
    count({ dedupeKey: { startsWith: prefix } }),
    count({ dedupeKey: { startsWith: `${prefix}${phoneKey}:` } }),
    count({ AND: [{ dedupeKey: { startsWith: prefix } }, { dedupeKey: { contains: `:${ipKey}:` } }] }),
  ]);
  if (demoDay >= SAMPLE_LIMITS.perDemoDay || phoneDay >= SAMPLE_LIMITS.perPhoneDay || ipDay >= SAMPLE_LIMITS.perIpDay) {
    throw tooMany();
  }

  const { message, created } = await messageParent({
    businessId: ctx.businessId,
    collectionId,
    kind: "PAYMENT_REQUEST",
    dedupeKey: `${prefix}${phoneKey}:${ipKey}:${collectionId}`,
    sentByUserId: ctx.userId,
    sampleTo: phoneE164,
  });
  if (!created) throw new HttpError(429, "This fee was already sent to that number today.");

  await audit({
    action: "demo.whatsapp_sample",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: { collectionId, messageId: message.id, status: message.status },
  });
  return message;
}
