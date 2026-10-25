import { z } from "zod";
import { LANGUAGES, type Language } from "@/messaging/templates/types";
import { computeKpis, type CollectionRow } from "../dashboard";
import { byRelevance, parentInsight, TOP_PARENTS, type InsightPayer, type ParentInsight } from "./parents";
import { insightPeriod, type Period } from "./period";
import { suggestionsFor, type Suggestion } from "./suggestions";

// "This week in plain words": the numbers, badges and suggestions behind the Overview summary. Pure and
// deterministic: code calculates, and the sentences (or later the AI) only put it into words. All money
// is integer cents. See docs/AI.md.

export * from "./parents";
export * from "./period";
export * from "./suggestions";

export type Insights = {
  period: Period;
  // The dashboard's own maths over fees due in the period, including due dates with no request sent yet.
  totals: { expectedCents: number; receivedCents: number; outstandingCents: number };
  // What makes up the week's outstanding money: due today (not late yet), never sent, and late (sent, past due).
  outstanding: { dueTodayCents: number; notSentCents: number; lateCents: number };
  // Null when no fee in the period was sent: unsent fees are never on time, so the rate would read 0%.
  onTimeRate: number | null;
  // The TOP_PARENTS most relevant parents, most relevant first.
  parents: ParentInsight[];
  suggestions: Suggestion[];
  // Over every parent, not just the top ones.
  behind: { count: number; cents: number };
  reliable: string[]; // first names, A–Z
};

/**
 * Insights for one business. `rows` are its collections from historyStart(today) on, plus the period's
 * due dates that have no request yet (projected); `payers` its active parents with a schedule. Rows of
 * parents who aren't in `payers` (archived) count towards the totals, but get no insight of their own.
 */
export function buildInsights({ rows, payers, today }: { rows: CollectionRow[]; payers: InsightPayer[]; today: string }): Insights {
  const period = insightPeriod(today);
  const inPeriod = rows.filter((r) => r.dueDate >= period.start && r.dueDate <= period.end);
  const kpis = computeKpis(inPeriod, today);

  const byPayer = new Map<string, CollectionRow[]>();
  for (const r of rows) byPayer.set(r.payerId, [...(byPayer.get(r.payerId) ?? []), r]);
  const everyone = payers.map((p) => parentInsight(p, byPayer.get(p.id) ?? [], today)).sort(byRelevance);
  const parents = everyone.slice(0, TOP_PARENTS);
  const behind = everyone.filter((p) => p.behindCents > 0);
  const short = (rs: CollectionRow[]) => rs.reduce((sum, r) => sum + Math.max(0, r.amountCents - r.paidCents), 0);

  return {
    period,
    totals: { expectedCents: kpis.expectedCents, receivedCents: kpis.receivedCents, outstandingCents: kpis.outstandingCents },
    outstanding: {
      dueTodayCents: short(inPeriod.filter((r) => r.dueDate === today)),
      notSentCents: short(inPeriod.filter((r) => r.dueDate < today && !r.requested)),
      lateCents: short(inPeriod.filter((r) => r.dueDate < today && r.requested)),
    },
    onTimeRate: inPeriod.some((r) => r.requested) ? kpis.onTimeRate : null,
    parents,
    suggestions: suggestionsFor(parents, everyone),
    behind: { count: behind.length, cents: behind.reduce((sum, p) => sum + p.behindCents, 0) },
    reliable: everyone
      .filter((p) => p.badge === "RELIABLE")
      .map((p) => p.firstName)
      .sort((a, b) => a.localeCompare(b, "en-ZA")),
  };
}

/** ?lang=… as one of our four languages, or `fallback` (the business's language) for anything else. */
export function pickLanguage(value: string | string[] | undefined, fallback: Language): Language {
  return z.enum(LANGUAGES).catch(fallback).parse(Array.isArray(value) ? value[0] : value);
}
