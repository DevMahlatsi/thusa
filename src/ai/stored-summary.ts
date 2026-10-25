import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { Insights } from "@/lib/insights";
import { plainWords } from "@/lib/insights/sentences";
import { logger } from "@/lib/logger";
import { todayInSa } from "@/lib/payers";
import type { Language } from "@/messaging/templates/types";
import { parseAiConfig } from "./client";
import { summarise } from "./summary";

// When the dashboard may call OpenAI for the week's summary, and what it shows otherwise. Every attempt is
// an AiSummary row (docs/AI.md "Caching"):
// - reuse the latest OK row for this business, language and week for 24 h, or until a payment comes in;
// - after a failed attempt, show the rule-based sentences for 15 minutes without calling;
// - at most MAX_CALLS_PER_DAY attempts per business per SA day, then the rule-based sentences;
// - sample data and a switched-off AI never touch OpenAI or this table.
// The decision and the claim (a PENDING row) happen in one short transaction under an advisory lock, so
// two page loads at once can't both call. The call itself happens outside it.

export const REUSE_MS = 24 * 60 * 60_000;
export const FAILURE_WAIT_MS = 15 * 60_000;
// A PENDING row younger than this is a call still in flight (the call times out after 8 s); older, it died.
export const IN_FLIGHT_MS = 60_000;
export const MAX_CALLS_PER_DAY = 20;
export const MAX_REFRESHES_PER_DAY = 5;

export type ShownSummary = { source: "ai"; text: string } | { source: "fallback"; facts: string[]; ideas: string[] };

type Env = Record<string, string | undefined>;
type Options = { now?: Date; source?: Env };

/** Whether AI summaries are switched on (AI_SUMMARY_ENABLED=true and a valid setup). */
export const aiSummariesOn = (source: Env = process.env) => "config" in parseAiConfig(source);

const toDbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
// South Africa has no daylight saving, so midnight is always +02:00.
const saMidnight = (now: Date) => new Date(`${todayInSa(now)}T00:00:00+02:00`);

type Decision =
  | { kind: "reuse"; text: string }
  | { kind: "blocked"; why: "in_flight" | "waiting" | "daily_cap" | "refresh_limit" }
  | { kind: "claimed"; id: string };

async function decide(
  businessId: string,
  insights: Insights,
  language: Language,
  now: Date,
  refreshBy: string | null,
): Promise<Decision> {
  const periodStart = toDbDate(insights.period.start);
  return db().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`thusa.ai_summary:${businessId}`}))::text`;
    const since = (ms: number) => new Date(now.getTime() - ms);

    if (refreshBy) {
      const refreshes = await tx.auditLog.count({
        where: { businessId, action: "ai.summary_refreshed", createdAt: { gte: saMidnight(now) } },
      });
      if (refreshes >= MAX_REFRESHES_PER_DAY) return { kind: "blocked", why: "refresh_limit" };
    } else {
      const ok = await tx.aiSummary.findFirst({
        where: { businessId, language, periodStart, status: "OK", createdAt: { gte: since(REUSE_MS) } },
        orderBy: { createdAt: "desc" },
      });
      const payment = await tx.ledgerEntry.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (ok?.text && (!payment || payment.createdAt <= ok.createdAt)) return { kind: "reuse", text: ok.text };
    }

    const last = await tx.aiSummary.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } });
    // Even a Refresh waits for a call that's still running.
    if (last?.status === "PENDING" && last.createdAt >= since(IN_FLIGHT_MS)) return { kind: "blocked", why: "in_flight" };
    if (!refreshBy && last && last.status !== "OK" && last.createdAt >= since(FAILURE_WAIT_MS)) return { kind: "blocked", why: "waiting" };
    const today = await tx.aiSummary.count({ where: { businessId, createdAt: { gte: saMidnight(now) } } });
    if (today >= MAX_CALLS_PER_DAY) return { kind: "blocked", why: "daily_cap" };

    if (refreshBy) {
      await audit({ action: "ai.summary_refreshed", userId: refreshBy, businessId, metadata: { language } }, tx);
    }
    const claim = await tx.aiSummary.create({
      data: { businessId, language, periodStart, status: "PENDING", createdAt: now },
      select: { id: true },
    });
    return { kind: "claimed", id: claim.id };
  });
}

/** Calls OpenAI for a claimed attempt and records how it went. */
async function complete(businessId: string, id: string, insights: Insights, language: Language, source: Env) {
  const result = await summarise(insights, language, source);
  await db().aiSummary.updateMany({
    where: { id, businessId },
    data: result.source === "ai" ? { status: "OK", text: result.text } : { status: "FAILED", failureReason: result.reason },
  });
  return result;
}

/**
 * The summary the dashboard shows for this business's week: stored or fresh AI text when allowed, else the
 * rule-based sentences. Never throws: if anything about the AI or its storage fails, the owner just gets the
 * rule-based sentences.
 */
export async function shownSummary(
  businessId: string,
  insights: Insights,
  language: Language,
  { isSample, now = new Date(), source = process.env }: Options & { isSample: boolean },
): Promise<ShownSummary> {
  const fallback = (): ShownSummary => ({ source: "fallback", ...plainWords(insights, language) });
  if (isSample || !aiSummariesOn(source)) return fallback();
  try {
    const decision = await decide(businessId, insights, language, now, null);
    if (decision.kind === "reuse") return { source: "ai", text: decision.text };
    if (decision.kind === "blocked") return fallback();
    const result = await complete(businessId, decision.id, insights, language, source);
    return result.source === "ai" ? { source: "ai", text: result.text } : fallback();
  } catch (err) {
    // The name and Prisma's error code only: a database error can echo the values it was given, such as the
    // AI's text. (Not logged as "code": the logger masks anything called that, for OTPs.)
    const kind = (err as { code?: unknown } | null)?.code;
    logger.error("ai.summary_store_failed", { error: err instanceof Error ? err.name : "unknown", kind: typeof kind === "string" ? kind : null });
    return fallback();
  }
}

/**
 * The owner's Refresh: a new AI summary now, skipping the 24 h reuse and the 15-minute wait, but not the
 * daily cap. At most MAX_REFRESHES_PER_DAY per business per SA day. Throws HttpErrors the owner can read.
 */
export async function refreshSummary(
  ctx: { userId: string; businessId: string },
  insights: Insights,
  language: Language,
  { now = new Date(), source = process.env }: Options = {},
): Promise<void> {
  if (!aiSummariesOn(source)) throw new HttpError(503, "AI summaries aren't switched on.");
  const decision = await decide(ctx.businessId, insights, language, now, ctx.userId);
  if (decision.kind === "blocked") {
    throw {
      refresh_limit: new HttpError(429, `That's the most refreshes for today (${MAX_REFRESHES_PER_DAY}). Try again tomorrow.`),
      daily_cap: new HttpError(429, "That's the most AI summaries for today. Try again tomorrow."),
      in_flight: new HttpError(409, "A summary is already being written. Reload the page in a moment."),
      waiting: new HttpError(409, "A summary is already being written. Reload the page in a moment."),
    }[decision.why];
  }
  if (decision.kind === "reuse") return;
  const result = await complete(ctx.businessId, decision.id, insights, language, source);
  if (result.source !== "ai") {
    throw new HttpError(502, "The AI summary didn't work this time. The one shown is worked out from your payment records.");
  }
}
