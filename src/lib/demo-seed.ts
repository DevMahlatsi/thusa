import { randomUUID } from "node:crypto";
import type { MessageKind } from "@/generated/prisma/client";
import { REMINDER_DAYS_AFTER_DUE } from "@/jobs/daily";
import { renderMessage } from "@/messaging/adapter";
import type { Language } from "@/messaging/templates/types";
import { audit } from "./audit";
import { demoLogin } from "./auth/demo";
import { newReference, reminderKey } from "./collections";
import type { CollectionStatus, Rhythm } from "./dashboard";
import { db } from "./db";
import { mask } from "./logger";
import { encryptPayerPhone, todayInSa } from "./payers";
import { addDays, dueDatesInMonth } from "./schedule-dates";

// The judges' demo crèche. Every judge shares the DEMO_PHONE login and can change anything, so each
// morning (and whenever the owner calls /api/cron/demo-reset) it is rebuilt: a new business with made-up
// parents and about four months of history (since their schedules started), worked out from today, so it
// always looks current and every parent has enough fees to show a pattern.
//
// Nothing is deleted. The ledger is append-only, so the old demo business stays as it was with its
// parents archived (no job or button acts on them again), and the demo login moves to the new business.
//
// The history is written here directly, not through payment webhooks: no money moved for it. Its rows
// have provider "demo", which no payment provider or webhook answers to, so a seeded request can never
// be paid or mistaken for a real one. Fees due from today on are left to the daily job and the judges,
// and those go through the configured provider as usual.
//
// Parents' numbers are +27 000 000 0NN. No South African mobile number starts with 0 after +27, so they
// can't belong to anyone, and the demo account's messages are never delivered anyway (parent-messages.ts).

export const DEMO_BUSINESS = {
  name: "Kopano Crèche",
  town: "Soweto",
  province: "GP",
  ecdRegistrationNumber: null,
  defaultLanguage: "en",
} as const;

// How a parent pays: on the due date, early (the owner sent the request ahead), a few days late, part of
// the latest fee (the balance is still owed), or behind on the last week or so.
type Habit = "on_time" | "early" | "late" | "part_paid" | "behind";

type DemoParent = {
  parentName: string;
  childName: string;
  language: Language | null;
  amountCents: number;
  rhythm: Rhythm;
  payday: number;
  habit: Habit;
};

export const DEMO_PARENTS: readonly DemoParent[] = [
  { parentName: "Thandi Mokoena", childName: "Lerato", language: null, amountCents: 145_000, rhythm: "MONTHLY", payday: 25, habit: "on_time" },
  { parentName: "Sipho Dlamini", childName: "Ayanda", language: "zu", amountCents: 35_000, rhythm: "WEEKLY", payday: 5, habit: "on_time" },
  { parentName: "Palesa Nkosi", childName: "Karabo", language: "st", amountCents: 70_000, rhythm: "FORTNIGHTLY", payday: 5, habit: "part_paid" },
  { parentName: "Johan van Wyk", childName: "Mia", language: null, amountCents: 160_000, rhythm: "MONTHLY", payday: 1, habit: "early" },
  { parentName: "Nomvula Khumalo", childName: "Siyabonga", language: "zu", amountCents: 35_000, rhythm: "WEEKLY", payday: 5, habit: "late" },
  { parentName: "Kagiso Molefe", childName: "Onalenna", language: "tn", amountCents: 145_000, rhythm: "MONTHLY", payday: 15, habit: "on_time" },
  { parentName: "Fatima Adams", childName: "Zaid", language: null, amountCents: 150_000, rhythm: "MONTHLY", payday: 31, habit: "on_time" },
  { parentName: "Lindiwe Zulu", childName: "Lwazi", language: "zu", amountCents: 72_000, rhythm: "FORTNIGHTLY", payday: 4, habit: "on_time" },
  { parentName: "Tshepo Mahlangu", childName: "Neo", language: "st", amountCents: 33_000, rhythm: "WEEKLY", payday: 1, habit: "on_time" },
  { parentName: "Grace Naidoo", childName: "Arjun", language: null, amountCents: 155_000, rhythm: "MONTHLY", payday: 7, habit: "on_time" },
  { parentName: "Mpho Sithole", childName: "Rethabile", language: "tn", amountCents: 145_000, rhythm: "MONTHLY", payday: 20, habit: "early" },
  { parentName: "Bongani Ndlovu", childName: "Sizwe", language: "zu", amountCents: 35_000, rhythm: "WEEKLY", payday: 3, habit: "behind" },
];

/** +27000000001, +27000000002, …: shaped like an SA number, but no real mobile number looks like this. */
export const demoPhone = (index: number) => `+27000000${String(index + 1).padStart(3, "0")}`;

/** A time on a South African date (always +02:00: no daylight saving). */
const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+02:00`);
const toDbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/**
 * The first of the month about four months back, so every schedule has run for a while. Seeded history
 * covers due dates from here up to yesterday: enough for monthly parents to have 3 or 4 fees, which "This
 * week in plain words" needs before it calls anyone reliable.
 */
export const demoStartsOn = (today: string) => `${addDays(today, -120).slice(0, 8)}01`;

export type PlannedFee = {
  parent: number; // index into DEMO_PARENTS
  dueDate: string;
  amountCents: number;
  requestedAt: Date;
  // The owner sent it from the dashboard; otherwise the daily job did, on the due date.
  byOwner: boolean;
  payments: { amountCents: number; at: Date }[];
  // Part-paid only: when the daily job sent the link for the balance (2 days after the due date).
  balanceAt: Date | null;
  // SA dates the daily job reminded the parent (2 and 7 days after the due date, while unpaid).
  reminders: string[];
};

function dueDatesBetween(parent: DemoParent, startsOn: string, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = addDays(`${month}-28`, 7).slice(0, 7)) {
    dates.push(...dueDatesInMonth({ ...parent, startsOn }, Number(month.slice(0, 4)), Number(month.slice(5, 7))));
  }
  return dates.filter((d) => d >= from && d <= to);
}

function paymentsFor(parent: DemoParent, index: number, dueDate: string, today: string, partPaid: string | undefined) {
  // On-time payers pay at different times of the due day (09:00–17:59), so the history doesn't look generated.
  const day = Number(dueDate.slice(8, 10));
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(9 + ((index * 3 + day) % 9))}:${pad((index * 17 + day) % 60)}`;
  const onTime = [{ amountCents: parent.amountCents, at: at(dueDate, time) }];
  switch (parent.habit) {
    case "early":
      return [{ amountCents: parent.amountCents, at: at(addDays(dueDate, -1), "19:05") }];
    case "late": {
      const paidOn = addDays(dueDate, 3);
      return paidOn < today ? [{ amountCents: parent.amountCents, at: at(paidOn, "12:40") }] : [];
    }
    case "part_paid":
      if (!partPaid || dueDate < partPaid) return onTime;
      // Half, in whole rand. Fees after it aren't paid yet.
      return dueDate === partPaid ? [{ amountCents: Math.floor(parent.amountCents / 200) * 100, at: at(dueDate, "17:20") }] : [];
    case "behind":
      return dueDate >= addDays(today, -9) ? [] : onTime;
    default:
      return onTime;
  }
}

/** The demo history for each parent's due dates before today. Pure, so the shape can be tested for any day. */
export function planDemoFees(today: string): PlannedFee[] {
  const startsOn = demoStartsOn(today);
  const yesterday = addDays(today, -1);
  return DEMO_PARENTS.flatMap((parent, index) => {
    const dates = dueDatesBetween(parent, startsOn, startsOn, yesterday);
    // The part-payer's latest fee at least 3 days old, so its balance has been requested. Fortnightly
    // fees fall in every 14-day window, so there always is one.
    const partPaid = parent.habit === "part_paid" ? dates.filter((d) => d <= addDays(today, -3)).at(-1) : undefined;
    return dates.map((dueDate): PlannedFee => {
      const byOwner = parent.habit === "early";
      const payments = paymentsFor(parent, index, dueDate, today, partPaid);
      // What the daily job did while the fee was unpaid: a part-paid fee gets its balance requested first,
      // then reminders.
      let balanceAt: Date | null = null;
      const reminders: string[] = [];
      for (const days of REMINDER_DAYS_AFTER_DUE) {
        const day = addDays(dueDate, days);
        if (day >= today) break;
        const when = at(day, "08:00");
        const paid = payments.filter((p) => p.at < when).reduce((sum, p) => sum + p.amountCents, 0);
        if (paid >= parent.amountCents) break;
        if (paid > 0 && !balanceAt) balanceAt = when;
        else reminders.push(day);
      }
      return {
        parent: index,
        dueDate,
        amountCents: parent.amountCents,
        requestedAt: byOwner ? at(addDays(dueDate, -3), "10:30") : at(dueDate, "08:00"),
        byOwner,
        payments,
        balanceAt,
        reminders,
      };
    });
  });
}

/** References no collection or balance request has yet. */
async function freshReferences(count: number): Promise<string[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const refs = new Set<string>();
    while (refs.size < count) refs.add(newReference());
    const reference = { in: [...refs] };
    const [collections, balances] = await Promise.all([
      db().collection.count({ where: { reference } }),
      db().balanceRequest.count({ where: { reference } }),
    ]);
    if (collections + balances === 0) return [...refs];
  }
  throw new Error("Could not find free payment references");
}

export type DemoResetSummary = {
  businessId: string;
  parents: number;
  fees: number;
  payments: number;
  messages: number;
  archivedParents: number;
};

/**
 * Builds a fresh demo crèche and points the DEMO_PHONE login at it. The old demo business's parents are
 * archived; nothing is deleted. Null when the demo login is switched off.
 */
export async function resetDemoAccount(now = new Date()): Promise<DemoResetSummary | null> {
  const demo = demoLogin();
  if (!demo) return null;
  const today = todayInSa(now);
  const startsOn = demoStartsOn(today);
  const fees = planDemoFees(today);
  const partPaid = fees.filter((f) => f.balanceAt);
  const refs = await freshReferences(fees.length + partPaid.length);

  const businessId = randomUUID();
  const payers = DEMO_PARENTS.map((p, index) => ({
    id: randomUUID(),
    businessId,
    parentName: p.parentName,
    childName: p.childName,
    phoneEncrypted: encryptPayerPhone(businessId, demoPhone(index)),
    language: p.language,
    // Oldest first, in list order.
    createdAt: new Date(at(startsOn, "09:00").getTime() + index * 60_000),
  }));
  const schedules = DEMO_PARENTS.map((p, index) => ({
    businessId,
    payerId: payers[index]!.id,
    amountCents: p.amountCents,
    rhythm: p.rhythm,
    payday: p.payday,
    startsOn: toDbDate(startsOn),
  }));

  const summary = await db().$transaction(
    async (tx) => {
      // Two resets at once would each build a business; one waits for the other instead.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('thusa.demo_reset'))::text`;
      const user = await tx.user.upsert({
        where: { phoneE164: demo.phoneE164 },
        create: { phoneE164: demo.phoneE164 },
        update: {},
      });
      const archived = user.businessId
        ? await tx.payer.updateMany({ where: { businessId: user.businessId, archivedAt: null }, data: { archivedAt: now } })
        : { count: 0 };
      await tx.business.create({ data: { id: businessId, ...DEMO_BUSINESS } });
      await tx.user.update({ where: { id: user.id }, data: { businessId, role: "OWNER" } });
      await tx.payer.createMany({ data: payers });
      await tx.schedule.createMany({ data: schedules });

      const collections = [];
      const ledger = [];
      const balances = [];
      const messages = [];
      for (const fee of fees) {
        const parent = DEMO_PARENTS[fee.parent]!;
        const payer = payers[fee.parent]!;
        const collectionId = randomUUID();
        const paidCents = fee.payments.reduce((sum, p) => sum + p.amountCents, 0);
        const status: CollectionStatus = paidCents >= fee.amountCents ? "PAID" : paidCents > 0 ? "PARTIAL" : "PENDING";
        const reference = refs.pop()!;
        collections.push({
          id: collectionId,
          businessId,
          payerId: payer.id,
          dueDate: toDbDate(fee.dueDate),
          amountCents: fee.amountCents,
          paidCents,
          rhythm: parent.rhythm,
          status,
          reference,
          idempotencyKey: randomUUID(),
          provider: "demo",
          providerRequestId: `demo_${randomUUID()}`,
          requestedAt: fee.requestedAt,
          requestedByUserId: fee.byOwner ? user.id : null,
          paidAt: status === "PAID" ? fee.payments.at(-1)!.at : null,
          createdAt: fee.requestedAt,
        });
        for (const payment of fee.payments) {
          ledger.push({
            businessId,
            collectionId,
            kind: "PAYMENT" as const,
            amountCents: payment.amountCents,
            provider: "demo",
            providerPaymentId: `demo_${randomUUID()}`,
            occurredAt: payment.at,
            createdAt: payment.at,
          });
        }

        const language = parent.language ?? DEMO_BUSINESS.defaultLanguage;
        const fields = (kind: MessageKind, dedupeKey: string, createdAt: Date, sentByUserId: string | null) => ({
          businessId,
          collectionId,
          kind,
          language,
          channel: "sms",
          phoneMasked: mask(demoPhone(fee.parent)),
          status: "NOT_DELIVERED" as const,
          note: "demo_account",
          sentByUserId,
          dedupeKey,
          createdAt,
        });
        const params = { business: DEMO_BUSINESS.name, child: parent.childName, dueDate: fee.dueDate, link: null };
        messages.push({
          ...fields("PAYMENT_REQUEST", `request:${collectionId}`, fee.requestedAt, fee.byOwner ? user.id : null),
          template: "payment_request",
          body: renderMessage(language, "payment_request", { ...params, amountCents: fee.amountCents, reference }),
        });

        // After a part-payment, the balance has its own reference, and reminders are about the balance.
        let owed = { amountCents: fee.amountCents, reference };
        if (fee.balanceAt) {
          const balance = { id: randomUUID(), amountCents: fee.amountCents - paidCents, reference: refs.pop()! };
          balances.push({
            ...balance,
            businessId,
            collectionId,
            forPaidCents: paidCents,
            idempotencyKey: randomUUID(),
            provider: "demo",
            providerRequestId: `demo_${randomUUID()}`,
            requestedAt: fee.balanceAt,
            createdAt: fee.balanceAt,
          });
          messages.push({
            ...fields("BALANCE_REQUEST", `balance:${balance.id}`, fee.balanceAt, null),
            template: "balance_request",
            body: renderMessage(language, "balance_request", { ...params, amountCents: balance.amountCents, reference: balance.reference, paidCents }),
          });
          owed = balance;
        }
        for (const day of fee.reminders) {
          messages.push({
            ...fields("REMINDER", reminderKey(collectionId, day), at(day, "08:00"), null),
            template: "payment_reminder",
            body: renderMessage(language, "payment_reminder", { ...params, amountCents: owed.amountCents, reference: owed.reference }),
          });
        }
      }

      await tx.collection.createMany({ data: collections });
      await tx.ledgerEntry.createMany({ data: ledger });
      await tx.balanceRequest.createMany({ data: balances });
      await tx.message.createMany({ data: messages });

      return {
        businessId,
        parents: payers.length,
        fees: collections.length,
        payments: ledger.length,
        messages: messages.length,
        archivedParents: archived.count,
      };
    },
    { timeout: 30_000 },
  );
  await audit({ action: "demo.reset", businessId, metadata: { today, ...summary } });
  return summary;
}
