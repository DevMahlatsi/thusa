import { audit } from "@/lib/audit";
import { requestBalance } from "@/lib/balance-requests";
import { requestCollection } from "@/lib/collections";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { clearExpiredInvitePhones } from "@/lib/invites";
import { logger } from "@/lib/logger";
import { todayInSa } from "@/lib/payers";
import { pruneRateLimitHits } from "@/lib/rate-limit";
import { sendReminder } from "@/lib/reminders";
import { addDays, dueDatesInMonth } from "@/lib/schedule-dates";

// The daily run (08:00 SA, from /api/cron/daily):
//   1. a payment request to every parent whose payday is today;
//   2. a reminder 2 and 7 days after a due date that isn't paid. A part-paid fee gets its balance
//      requested instead, which sends the parent the balance link.
// Parents awaiting approval (src/lib/invites.ts) aren't payers yet, so neither step can reach them.
// There's no logged-in owner here, so the job looks across businesses and then acts for each row's own
// businessId, through the same functions (and limits) as the owner's buttons. Everything it does is
// idempotent: a second run on the same day sends nothing new.

export const REMINDER_DAYS_AFTER_DUE = [2, 7];
// Keeps one run well inside the function's time limit. Anything left over waits for tomorrow's run.
export const MAX_ACTIONS_PER_RUN = 150;

export type DailySummary = { requests: number; reminders: number; balances: number; skipped: number; failed: number; capped: boolean };

const isSkip = (err: unknown) => err instanceof HttpError && err.status < 500;

export async function runDailyJobs(now = new Date()): Promise<DailySummary> {
  const today = todayInSa(now);
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const summary: DailySummary = { requests: 0, reminders: 0, balances: 0, skipped: 0, failed: 0, capped: false };
  let actions = 0;

  async function attempt(kind: "requests" | "reminders" | "balances", ref: string, action: () => Promise<boolean>) {
    if (actions >= MAX_ACTIONS_PER_RUN) {
      summary.capped = true;
      return;
    }
    actions++;
    try {
      if (await action()) summary[kind]++;
      else summary.skipped++;
    } catch (err) {
      if (isSkip(err)) summary.skipped++;
      else {
        summary.failed++;
        logger.error("jobs.daily_action_failed", { kind, ref, error: err });
      }
    }
  }

  // 1. Payment requests for today's due dates.
  const payers = await db().payer.findMany({
    where: { archivedAt: null, schedule: { isNot: null } },
    select: { id: true, businessId: true, schedule: true },
    orderBy: { id: "asc" },
  });
  for (const payer of payers) {
    const schedule = payer.schedule!;
    const due = dueDatesInMonth({ ...schedule, startsOn: schedule.startsOn.toISOString().slice(0, 10) }, year, month);
    if (!due.includes(today)) continue;
    await attempt("requests", payer.id, async () => {
      const { sent } = await requestCollection({ userId: null, businessId: payer.businessId }, { payerId: payer.id, dueDate: today }, now);
      return sent;
    });
  }

  // 2. Reminders (or balance requests) for fees due 2 and 7 days ago that aren't paid.
  const dueDates = REMINDER_DAYS_AFTER_DUE.map((days) => new Date(`${addDays(today, -days)}T00:00:00Z`));
  const unpaid = await db().collection.findMany({
    where: {
      dueDate: { in: dueDates },
      status: { in: ["PENDING", "PARTIAL"] },
      providerRequestId: { not: null },
      payer: { archivedAt: null },
    },
    select: {
      id: true,
      businessId: true,
      status: true,
      paidCents: true,
      // Only balance requests that reached the provider; one that failed is asked for again.
      balanceRequests: { where: { providerRequestId: { not: null } }, select: { forPaidCents: true } },
    },
    orderBy: { id: "asc" },
  });
  for (const c of unpaid) {
    const ctx = { userId: null, businessId: c.businessId };
    const needsBalance = c.status === "PARTIAL" && !c.balanceRequests.some((b) => b.forPaidCents === c.paidCents);
    if (needsBalance) {
      await attempt("balances", c.id, async () => (await requestBalance(ctx, c.id)).sent);
    } else {
      await attempt("reminders", c.id, async () => Boolean(await sendReminder(ctx, c.id, now)));
    }
  }

  // Housekeeping: rate-limit counts older than any window needs, and parents' numbers on links that expired
  // unused. Never stops the run.
  await pruneRateLimitHits(now).catch((err) => logger.error("jobs.rate_limit_prune_failed", { error: err }));
  await clearExpiredInvitePhones(now).catch((err) => logger.error("jobs.invite_phone_clear_failed", { error: err }));

  await audit({ action: "jobs.daily_run", metadata: { today, ...summary } });
  logger.info("jobs.daily_run", { today, ...summary });
  return summary;
}
