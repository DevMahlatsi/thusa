import { z } from "zod";
import { LANGUAGES } from "@/messaging/templates/types";
import { audit } from "./audit";
import { db } from "./db";
import { decryptField, encryptField } from "./field-crypto";
import { HttpError } from "./http";
import { mask } from "./logger";
import { saMobileSchema } from "./phone";

// Payers (parents) and their schedules. Every function takes the caller's businessId and every query
// filters on it, so one business can never read or change another's payers.

export const RHYTHMS = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;

// R100 000 per collection: far above any crèche fee, low enough to catch a typo of extra zeros.
export const MAX_AMOUNT_CENTS = 10_000_000;

// Letters (any script, with accents), spaces, apostrophes, hyphens and full stops. Names end up in
// messages to parents, so nothing that could carry a link or markup.
const NAME = /^[\p{L}\p{M}' .-]+$/u;

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(80, `The ${label} is too long`)
    .regex(NAME, `The ${label} can only contain letters, spaces, ' and -`);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, "That date doesn't exist");

// Strict: unknown keys (e.g. a smuggled businessId) are rejected, not ignored.
export const scheduleSchema = z
  .strictObject({
    amountCents: z
      .number({ error: "Enter an amount" })
      .int("Amount must be in whole cents")
      .min(1, "Amount must be more than R 0")
      .max(MAX_AMOUNT_CENTS, "Amount is too large"),
    rhythm: z.enum(RHYTHMS, { error: "Choose weekly, fortnightly or monthly" }),
    // WEEKLY/FORTNIGHTLY: ISO weekday 1 (Mon) – 7 (Sun). MONTHLY: day of month 1–31.
    payday: z.number({ error: "Choose a payday" }).int("Choose a payday"),
    // Defaults to today (South African time) when left out.
    startsOn: isoDate.optional(),
  })
  .refine((s) => s.payday >= 1 && s.payday <= (s.rhythm === "MONTHLY" ? 31 : 7), {
    path: ["payday"],
    message: "Choose a payday",
  });

export const payerInputSchema = z.strictObject({
  parentName: nameSchema("parent's name"),
  childName: nameSchema("child's name"),
  phone: saMobileSchema,
  // Null or left out: use the business's default language.
  language: z.enum(LANGUAGES).nullish().transform((v) => v ?? null),
  schedule: scheduleSchema,
});

export type PayerInput = z.infer<typeof payerInputSchema>;

// Editing: leave the phone out to keep the stored number. The edit form only ever sees it masked.
export const payerUpdateSchema = payerInputSchema.extend({ phone: saMobileSchema.optional() });

export type PayerUpdate = z.infer<typeof payerUpdateSchema>;

export const payerIdSchema = z.uuid();

type Ctx = { userId: string; businessId: string };

const phoneContext = (businessId: string) => `payer.phone:${businessId}`;

/** Today's date in South Africa as YYYY-MM-DD. */
export function todayInSa(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
}

const toDbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function scheduleData(schedule: PayerInput["schedule"]) {
  return {
    amountCents: schedule.amountCents,
    rhythm: schedule.rhythm,
    payday: schedule.payday,
    startsOn: toDbDate(schedule.startsOn ?? todayInSa()),
  };
}

export async function createPayer(ctx: Ctx, input: PayerInput) {
  const payer = await db().payer.create({
    data: {
      businessId: ctx.businessId,
      parentName: input.parentName,
      childName: input.childName,
      phoneEncrypted: encryptField(input.phone, phoneContext(ctx.businessId)),
      language: input.language,
      // payerId and businessId both come from the payer via the compound foreign key.
      schedule: { create: scheduleData(input.schedule) },
    },
    include: { schedule: true },
  });
  await audit({ action: "payer.created", userId: ctx.userId, businessId: ctx.businessId, metadata: { payerId: payer.id } });
  return payer;
}

/** Active payers for this business, oldest first. */
export async function listPayers(businessId: string) {
  return db().payer.findMany({
    where: { businessId, archivedAt: null },
    include: { schedule: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** Null if the payer doesn't exist or belongs to another business. Includes archived payers. */
export async function getPayer(businessId: string, payerId: string) {
  return db().payer.findFirst({ where: { id: payerId, businessId }, include: { schedule: true } });
}

export async function updatePayer(ctx: Ctx, payerId: string, input: PayerUpdate) {
  const payer = await db().$transaction(async (tx) => {
    // Archived payers can't be edited: they're gone from lists and collections.
    const updated = await tx.payer.updateMany({
      where: { id: payerId, businessId: ctx.businessId, archivedAt: null },
      data: {
        parentName: input.parentName,
        childName: input.childName,
        ...(input.phone && { phoneEncrypted: encryptField(input.phone, phoneContext(ctx.businessId)) }),
        language: input.language,
      },
    });
    if (updated.count === 0) throw new HttpError(404, "Parent not found.");
    const data = scheduleData(input.schedule);
    await tx.schedule.upsert({
      where: { payerId_businessId: { payerId, businessId: ctx.businessId } },
      create: { ...data, payerId, businessId: ctx.businessId },
      update: data,
    });
    return tx.payer.findFirstOrThrow({ where: { id: payerId, businessId: ctx.businessId }, include: { schedule: true } });
  });
  await audit({
    action: "payer.updated",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: { payerId, phoneChanged: Boolean(input.phone) },
  });
  return payer;
}

/** Hides the payer from lists and future collections. History stays. */
export async function archivePayer(ctx: Ctx, payerId: string) {
  const archived = await db().payer.updateMany({
    where: { id: payerId, businessId: ctx.businessId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (archived.count === 0) throw new HttpError(404, "Parent not found.");
  await audit({ action: "payer.archived", userId: ctx.userId, businessId: ctx.businessId, metadata: { payerId } });
}

type PayerRow = NonNullable<Awaited<ReturnType<typeof getPayer>>>;

/** Decrypts the phone number. Only for sending messages or the owner's edit form; never log it. */
export function payerPhone(payer: Pick<PayerRow, "businessId" | "phoneEncrypted">): string {
  return decryptField(payer.phoneEncrypted, phoneContext(payer.businessId));
}

/** Safe for lists: the phone is masked (••••4567). */
export function toPayerDto(payer: PayerRow) {
  return {
    id: payer.id,
    parentName: payer.parentName,
    childName: payer.childName,
    phoneMasked: mask(payerPhone(payer)),
    language: payer.language,
    archived: payer.archivedAt !== null,
    schedule: payer.schedule && {
      amountCents: payer.schedule.amountCents,
      rhythm: payer.schedule.rhythm,
      payday: payer.schedule.payday,
      startsOn: payer.schedule.startsOn.toISOString().slice(0, 10),
    },
  };
}
