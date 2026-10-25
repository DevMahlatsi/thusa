import type { ParentInsight } from "./parents";

// Options for the owner, never instructions, and never a penalty, a discount or a price change.
// At most one per parent.

export type Suggestion =
  // Behind by more than one whole fee.
  | { type: "OFFER_ARRANGEMENT"; payerId: string; firstName: string; behindCents: number }
  // NEEDS_SUPPORT on a monthly or fortnightly schedule: smaller, more frequent amounts may be easier.
  | { type: "SWITCH_TO_WEEKLY"; payerId: string; firstName: string; rhythm: "MONTHLY" | "FORTNIGHTLY" }
  // How many parents paid a fee before it was due: the owner could thank them.
  | { type: "REWARD_UPFRONT"; count: number };

/** Suggestions for these parents, in their order, plus one REWARD_UPFRONT counted over `everyone`. */
export function suggestionsFor(parents: ParentInsight[], everyone: ParentInsight[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const p of parents) {
    if (p.behindCents > p.feeCents) {
      suggestions.push({ type: "OFFER_ARRANGEMENT", payerId: p.id, firstName: p.firstName, behindCents: p.behindCents });
    } else if (p.badge === "NEEDS_SUPPORT" && p.rhythm !== "WEEKLY") {
      suggestions.push({ type: "SWITCH_TO_WEEKLY", payerId: p.id, firstName: p.firstName, rhythm: p.rhythm });
    }
  }
  const early = everyone.filter((p) => p.paidEarly).length;
  if (early > 0) suggestions.push({ type: "REWARD_UPFRONT", count: early });
  return suggestions;
}
