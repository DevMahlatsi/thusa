import type { Rhythm } from "@/lib/dashboard";
import type { Badge, Insights } from "@/lib/insights";
import { PERIOD_DAYS } from "@/lib/insights/period";
import { plainWords } from "@/lib/insights/sentences";
import { logger } from "@/lib/logger";
import type { Language } from "@/messaging/templates/types";
import { AiRequestError, createResponse, parseAiConfig, type AiFailure } from "./client";
import { instructionsFor, MAX_SUMMARY_CHARS } from "./prompt";

// "This week in plain words" by AI: code calculates (src/lib/insights/), the AI only puts it into words.
// The request carries only what docs/AI.md allows: first names, rhythms, badges, amounts, counts and the
// week. The answer is untrusted text: anything empty, too long, formatted, or with a number that isn't in
// the request is thrown away, and the owner sees the rule-based sentences instead. Display text only:
// nothing here, or that uses it, may ever reach src/messaging/.

export type SummaryFailure = AiFailure | "too_long" | "bad_format" | "bad_number";

export type Summary =
  | { source: "ai"; text: string }
  | { source: "fallback"; reason: SummaryFailure; facts: string[]; ideas: string[] };

/** What goes to OpenAI, built field by field from the insights (never the insights whole). */
export type AiInput = {
  language: Language;
  period: string;
  currency: "ZAR";
  totals: { expectedCents: number; receivedCents: number; outstandingCents: number };
  onTimeRate: number | null;
  behind: { parents: number; cents: number };
  parents: { firstName: string; rhythm: Rhythm; badge: Badge; behindCents: number }[];
  suggestions: ({ type: "OFFER_ARRANGEMENT" | "SWITCH_TO_WEEKLY"; firstName: string } | { type: "REWARD_UPFRONT"; count: number })[];
};

export function buildAiInput(insights: Insights, language: Language): AiInput {
  const { totals } = insights;
  return {
    language,
    period: insights.period.label,
    currency: "ZAR",
    totals: { expectedCents: totals.expectedCents, receivedCents: totals.receivedCents, outstandingCents: totals.outstandingCents },
    // Two decimals, so the percentage the AI writes is a whole number we can check.
    onTimeRate: insights.onTimeRate === null ? null : Math.round(insights.onTimeRate * 100) / 100,
    behind: { parents: insights.behind.count, cents: insights.behind.cents },
    parents: insights.parents.map((p) => ({ firstName: p.firstName, rhythm: p.rhythm, badge: p.badge, behindCents: p.behindCents })),
    suggestions: insights.suggestions.map((s) =>
      s.type === "REWARD_UPFRONT" ? { type: s.type, count: s.count } : { type: s.type, firstName: s.firstName },
    ),
  };
}

/** The numbers the AI may write: amounts (in cents) and everything else (counts, the %, the week's dates). */
export function allowedNumbers(input: AiInput): { cents: Set<number>; plain: Set<number> } {
  const cents = new Set([
    ...Object.values(input.totals),
    input.behind.cents,
    ...input.parents.map((p) => p.behindCents),
  ]);
  const count = (pred: (p: AiInput["parents"][number]) => boolean) => input.parents.filter(pred).length;
  const plain = new Set<number>([
    input.behind.parents,
    input.parents.length,
    count((p) => p.behindCents > 0),
    ...(["NEEDS_SUPPORT", "RELIABLE", "ON_TRACK", "NEW"] as const).map((badge) => count((p) => p.badge === badge)),
    input.suggestions.length,
    ...input.suggestions.flatMap((s) => (s.type === "REWARD_UPFRONT" ? [s.count] : [])),
    PERIOD_DAYS,
    ...(input.period.match(/\d+/g) ?? []).map(Number),
  ]);
  if (input.onTimeRate !== null) plain.add(Math.round(input.onTimeRate * 100));
  return { cents, plain };
}

// R4 200, R 4 200.00, R4,200, R4200, R350,50 (a decimal comma).
const AMOUNT = /R\s?(\d{1,3}(?:[ \u00a0\u202f,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
const MARKUP = /[*#`_<>[\]|~{}]|^\s*(?:[-•]|\d+[.)])\s/m;
const LINK = /https?:|www\.|\b[\w-]+\.(?:com|co|za|org|net|io|me|ly|link)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const GENDERED = /\b(?:he|she|him|his|her|hers|himself|herself)\b/i;

/** The AI's text, tidied, if it can be shown; otherwise why not. */
export function checkSummary(raw: string, input: AiInput): { ok: true; text: string } | { ok: false; reason: SummaryFailure } {
  // Line breaks and runs of spaces become one space; non-breaking spaces inside amounts stay.
  const text = raw.replace(/[^\S\u00a0\u202f]+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_SUMMARY_CHARS) return { ok: false, reason: "too_long" };
  if (MARKUP.test(raw) || LINK.test(text) || EMOJI.test(text)) return { ok: false, reason: "bad_format" };
  if (input.language === "en" && GENDERED.test(text)) return { ok: false, reason: "bad_format" };

  const allowed = allowedNumbers(input);
  let rest = text;
  for (const m of text.matchAll(AMOUNT)) {
    const amountCents = Number(m[1]!.replace(/\D/g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
    if (!allowed.cents.has(amountCents)) return { ok: false, reason: "bad_number" };
    rest = rest.replace(m[0], " ");
  }
  for (const m of rest.matchAll(NUMBER)) {
    // A decimal that isn't an amount (0.82, 4.2k) is never one of ours.
    if (/[.,]/.test(m[0]) || !allowed.plain.has(Number(m[0]))) return { ok: false, reason: "bad_number" };
  }
  return { ok: true, text };
}

/**
 * The week's summary for the owner: AI text when the AI is on and its answer passes the checks, else the
 * rule-based sentences. Never throws on the AI's account; the log gets the failure's reason and nothing else.
 */
export async function summarise(insights: Insights, language: Language, source: Record<string, string | undefined> = process.env): Promise<Summary> {
  const fallback = (reason: SummaryFailure): Summary => {
    (reason === "disabled" || reason === "no_key" ? logger.info : logger.warn)("ai.summary_fallback", { reason });
    return { source: "fallback", reason, ...plainWords(insights, language) };
  };

  const setup = parseAiConfig(source);
  if ("reason" in setup) return fallback(setup.reason);

  const input = buildAiInput(insights, language);
  let raw: string;
  try {
    raw = await createResponse(setup.config, { instructions: instructionsFor(language), input: JSON.stringify(input) });
  } catch (err) {
    return fallback(err instanceof AiRequestError ? err.reason : "network");
  }
  const checked = checkSummary(raw, input);
  return checked.ok ? { source: "ai", text: checked.text } : fallback(checked.reason);
}
