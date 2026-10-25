import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { paymentProvider, type PaymentProvider } from "@/payments/adapter";
import { audit } from "./audit";
import type { CollectionRow } from "./dashboard";
import { db } from "./db";
import { HttpError } from "./http";
import { logger } from "./logger";
import { messageParent } from "./parent-messages";
import { todayInSa } from "./payers";
import { addDays, dueDatesInMonth } from "./schedule-dates";

// Collections: one payment request to a payer for one due date. The request names a parent and a due
// date, nothing else; the amount always comes from the payer's stored schedule. Every query filters on
// the caller's businessId.

// Requests can go out up to a week before payday, for any due date this month.
export const REQUEST_AHEAD_DAYS = 7;
// Per business per SA day. Far above a crèche's needs; stops a runaway script or a shared demo account.
export const MAX_REQUESTS_PER_DAY = 200;
// A request stuck "sending" this long (say the server died mid-call) may be tried again.
export const SENDING_TIMEOUT_MS = 60_000;

/** Whether a request can go out now for this due date: this month's fees, up to REQUEST_AHEAD_DAYS ahead. */
export const canRequestNow = (dueDate: string, today: string) =>
  dueDate.slice(0, 7) === today.slice(0, 7) && dueDate <= addDays(today, REQUEST_AHEAD_DAYS);

// Strict: an amountCents (or businessId) in the body is rejected, not ignored.
export const collectionRequestSchema = z.strictObject({
  payerId: z.uuid({ error: "Parent not found." }),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
});

export type CollectionRequest = z.infer<typeof collectionRequestSchema>;

// userId is null when Thusa acts on its own (the daily job).
export type Ctx = { userId: string | null; businessId: string };

// No 0/O or 1/I/L, so a parent can read it off a statement. randomInt keeps every symbol equally likely.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** E.g. THK7Q2M9XA: short enough for any bank's reference field, ~40 bits of randomness. */
export function newReference(): string {
  let ref = "TH";
  for (let i = 0; i < 8; i++) ref += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return ref;
}

/**
 * A reference no collection or balance request has. Each table's unique index guards its own rows;
 * this keeps the two apart, so a reference always names exactly one payment request.
 */
export async function freshReference(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    const [collection, balance] = await Promise.all([
      db().collection.findUnique({ where: { reference }, select: { id: true } }),
      db().balanceRequest.findUnique({ where: { reference }, select: { id: true } }),
    ]);
    if (!collection && !balance) return reference;
  }
  throw new Error("Could not find a free payment reference");
}

const toDbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function findCollection(businessId: string, payerId: string, dueDate: string) {
  return db().collection.findFirst({ where: { businessId, payerId, dueDate: toDbDate(dueDate) } });
}

type Collection = NonNullable<Awaited<ReturnType<typeof findCollection>>>;

async function assertUnderDailyCap(businessId: string, today: string) {
  // South Africa has no daylight saving, so midnight is always +02:00.
  const since = new Date(`${today}T00:00:00+02:00`);
  const count = await db().collection.count({ where: { businessId, createdAt: { gte: since } } });
  if (count >= MAX_REQUESTS_PER_DAY) {
    throw new HttpError(429, "That's the most payment requests for one day. Try again tomorrow.");
  }
}

async function insertCollection(
  ctx: Ctx,
  payerId: string,
  dueDate: string,
  schedule: { amountCents: number; rhythm: Collection["rhythm"] },
  provider: PaymentProvider,
): Promise<Collection> {
  // Skipping duplicates makes a double click (same payer and due date) harmless. If the row is still
  // missing afterwards, the random reference collided: try another.
  for (let attempt = 0; attempt < 3; attempt++) {
    await db().collection.createMany({
      data: {
        businessId: ctx.businessId,
        payerId,
        dueDate: toDbDate(dueDate),
        amountCents: schedule.amountCents,
        rhythm: schedule.rhythm,
        reference: await freshReference(),
        idempotencyKey: randomUUID(),
        provider: provider.name,
      },
      skipDuplicates: true,
    });
    const row = await findCollection(ctx.businessId, payerId, dueDate);
    if (row) return row;
  }
  throw new Error("Could not create a unique collection reference");
}

/**
 * Asks the payment provider for a payment request for one parent's due date. Safe to repeat: a due
 * date that already has a request returns it (`sent: false`), and one whose earlier attempt failed is
 * retried with the same reference and idempotency key.
 */
export async function requestCollection(ctx: Ctx, input: CollectionRequest, now = new Date()) {
  const today = todayInSa(now);
  const payer = await db().payer.findFirst({
    where: { id: input.payerId, businessId: ctx.businessId, archivedAt: null },
    include: { schedule: true },
  });
  if (!payer?.schedule) throw new HttpError(404, "Parent not found.");
  const { schedule } = payer;

  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  if (!canRequestNow(input.dueDate, today)) {
    throw new HttpError(400, `Requests can go out for this month's fees, up to ${REQUEST_AHEAD_DAYS} days before they're due.`);
  }
  const dueDates = dueDatesInMonth({ ...schedule, startsOn: schedule.startsOn.toISOString().slice(0, 10) }, year, month);
  if (!dueDates.includes(input.dueDate)) throw new HttpError(400, "That isn't one of this parent's due dates.");

  let provider: PaymentProvider;
  try {
    provider = paymentProvider();
  } catch (err) {
    logger.error("payments.not_configured", { error: err });
    throw new HttpError(503, "Payment requests aren't switched on yet.");
  }

  let collection = await findCollection(ctx.businessId, payer.id, input.dueDate);
  if (!collection) {
    await assertUnderDailyCap(ctx.businessId, today);
    collection = await insertCollection(ctx, payer.id, input.dueDate, schedule, provider);
  }
  if (collection.providerRequestId) return { collection, sent: false };

  // Claim the collection, so two clicks at once can't both reach the provider.
  const claimed = await db().collection.updateMany({
    where: {
      id: collection.id,
      businessId: ctx.businessId,
      providerRequestId: null,
      OR: [{ sendingSince: null }, { sendingSince: { lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } }],
    },
    data: { sendingSince: new Date() },
  });
  if (claimed.count === 0) {
    const current = await findCollection(ctx.businessId, payer.id, input.dueDate);
    if (current?.providerRequestId) return { collection: current, sent: false };
    throw new HttpError(409, "This request is already being sent. Refresh in a moment.");
  }

  let result;
  try {
    result = await provider.createPaymentRequest({
      amountCents: collection.amountCents,
      reference: collection.reference,
      idempotencyKey: collection.idempotencyKey,
      payerName: payer.parentName,
    });
  } catch (err) {
    await db().collection.updateMany({
      where: { id: collection.id, businessId: ctx.businessId },
      data: { sendingSince: null },
    });
    logger.error("payments.request_failed", { collectionId: collection.id, provider: provider.name, error: err });
    throw new HttpError(502, "The payment provider didn't accept the request. Please try again.");
  }

  const sent = await db().collection.update({
    where: { id_businessId: { id: collection.id, businessId: ctx.businessId } },
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
    action: "collection.requested",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: {
      collectionId: sent.id,
      payerId: payer.id,
      reference: sent.reference,
      amountCents: sent.amountCents,
      provider: provider.name,
    },
  });
  // The request stands even if the message can't go out: the owner sees why on /messages and can remind.
  try {
    await messageParent({
      businessId: ctx.businessId,
      collectionId: sent.id,
      kind: "PAYMENT_REQUEST",
      dedupeKey: `request:${sent.id}`,
      sentByUserId: ctx.userId,
    });
  } catch (err) {
    logger.error("messaging.request_message_failed", { collectionId: sent.id, error: err });
  }
  return { collection: sent, sent: true };
}

/** Collections due in the given month (1–12), as dashboard rows. Names only; phones aren't read. */
export async function listCollectionRows(businessId: string, year: number, month: number, now = new Date()): Promise<CollectionRow[]> {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  return listCollectionRowsBetween(businessId, `${ym}-01`, `${ym}-${lastDay}`, now);
}

/** Collections due from `from` to `to` (YYYY-MM-DD, both included), as dashboard rows. Names only. */
export async function listCollectionRowsBetween(businessId: string, from: string, to: string, now = new Date()): Promise<CollectionRow[]> {
  const today = todayInSa(now);
  const rows = await db().collection.findMany({
    where: { businessId, dueDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: {
      payer: { select: { parentName: true, childName: true } },
      balanceRequests: { where: { businessId, providerRequestId: { not: null } }, select: { forPaidCents: true, paymentUrl: true } },
      messages: { where: { businessId, kind: "REMINDER", status: { not: "FAILED" } }, select: { dedupeKey: true } },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  return rows.map((c) => {
    // A part-paid collection is paid on its balance request's link, once there is one.
    const balance = c.status === "PARTIAL" ? c.balanceRequests.find((b) => b.forPaidCents === c.paidCents) : undefined;
    return {
      id: c.id,
      payerId: c.payerId,
      parentName: c.payer.parentName,
      childName: c.payer.childName,
      reference: c.reference,
      rhythm: c.rhythm,
      dueDate: c.dueDate.toISOString().slice(0, 10),
      amountCents: c.amountCents,
      paidCents: c.paidCents,
      status: c.status,
      // Paid in full on or before the due date, by SA calendar day.
      paidOnTime: c.status === "PAID" && c.paidAt !== null && todayInSa(c.paidAt) <= c.dueDate.toISOString().slice(0, 10),
      paidOn: c.status === "PAID" && c.paidAt !== null ? todayInSa(c.paidAt) : null,
      // A row whose provider call failed is not sent yet: the owner can try again.
      requested: c.providerRequestId !== null,
      paymentUrl: balance ? balance.paymentUrl : c.paymentUrl,
      balanceRequested: balance !== undefined,
      remindersSent: c.messages.length,
      remindedToday: c.messages.some((m) => m.dedupeKey === reminderKey(c.id, today)),
    };
  });
}

/** The earliest due date this business has a payment request for (YYYY-MM-DD), or null if none. */
export async function firstDueDate(businessId: string): Promise<string | null> {
  const first = await db().collection.findFirst({ where: { businessId }, orderBy: { dueDate: "asc" }, select: { dueDate: true } });
  return first?.dueDate.toISOString().slice(0, 10) ?? null;
}

/** One reminder per collection per SA day, whoever sends it. */
export const reminderKey = (collectionId: string, today: string) => `reminder:${collectionId}:${today}`;

/** Safe for API responses: no idempotency key or provider ids. */
export function toCollectionDto(c: Collection) {
  return {
    id: c.id,
    payerId: c.payerId,
    dueDate: c.dueDate.toISOString().slice(0, 10),
    amountCents: c.amountCents,
    paidCents: c.paidCents,
    rhythm: c.rhythm,
    status: c.status,
    reference: c.reference,
    paymentUrl: c.paymentUrl,
    requestedAt: c.requestedAt?.toISOString() ?? null,
    paidAt: c.paidAt?.toISOString() ?? null,
  };
}
