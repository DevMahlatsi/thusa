import { audit } from "./audit";
import { reminderKey, type Ctx } from "./collections";
import { db } from "./db";
import { HttpError } from "./http";
import { messageParent } from "./parent-messages";
import { todayInSa } from "./payers";

// Polite reminders about a fee that's due and not paid. Never more than one a day per fee and never
// more than MAX_REMINDERS in all, whether the owner sends them or the daily job does. No late fees and
// no penalties: the message only says what is owed and how to pay.

export const MAX_REMINDERS = 3;

/** Reminds a parent about one collection. The owner's button and the daily job both come through here. */
export async function sendReminder(ctx: Ctx, collectionId: string, now = new Date()) {
  const today = todayInSa(now);
  const collection = await db().collection.findFirst({
    where: { id: collectionId, businessId: ctx.businessId, payer: { archivedAt: null } },
  });
  if (!collection) throw new HttpError(404, "Payment request not found.");
  if (!collection.providerRequestId) throw new HttpError(409, "Send the payment request first.");
  if (collection.status === "PAID") throw new HttpError(409, "This fee is already paid.");
  if (collection.dueDate.toISOString().slice(0, 10) > today) {
    throw new HttpError(409, "You can send a reminder once the fee is due.");
  }

  const sent = await db().message.count({
    where: { businessId: ctx.businessId, collectionId, kind: "REMINDER", status: { not: "FAILED" } },
  });
  if (sent >= MAX_REMINDERS) {
    throw new HttpError(429, `This parent has had ${MAX_REMINDERS} reminders for this fee. That's the most Thusa sends.`);
  }

  // A part-paid fee is reminded about its balance; messageParent refuses until there's a balance request.
  const { message, created } = await messageParent({
    businessId: ctx.businessId,
    collectionId,
    kind: "REMINDER",
    dedupeKey: reminderKey(collectionId, today),
    sentByUserId: ctx.userId,
  });
  if (!created) throw new HttpError(429, "This parent was already reminded today. Try again tomorrow.");

  await audit({
    action: "collection.reminded",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: { collectionId, messageId: message.id, status: message.status, automatic: ctx.userId === null },
  });
  return message;
}
