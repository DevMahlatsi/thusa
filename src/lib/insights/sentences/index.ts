import type { Language } from "@/messaging/templates/types";
import type { Insights } from "..";
import { BEHIND_WINDOW_DAYS } from "../parents";
import { en } from "./en";
import { st } from "./st";
import { tn } from "./tn";
import type { SentenceSet } from "./types";
import { zu } from "./zu";

// The insights as fixed sentences: what the panel shows until there is an AI summary, and whenever the AI
// fails. For the owner's screen only; messages to parents use src/messaging/templates/.

export const sentences: Record<Language, SentenceSet> = { en, zu, st, tn };

// Kept short: the panel is a summary, and Who's paid has everyone.
const NAMED_RELIABLE = 3;
const PARENT_IDEAS = 3;

/** facts: what happened this week. ideas: the suggestions, as options for the owner. */
export function plainWords(insights: Insights, language: Language): { facts: string[]; ideas: string[] } {
  const t = sentences[language];
  const { totals, onTimeRate, behind, reliable } = insights;

  const facts: string[] = [];
  if (totals.expectedCents === 0) facts.push(t.nothingDue());
  else {
    facts.push(t.received(totals));
    facts.push(totals.outstandingCents > 0 ? t.outstanding(totals) : t.allPaid());
  }
  if (onTimeRate !== null) facts.push(t.onTime({ percent: Math.round(onTimeRate * 100) }));
  if (behind.count > 0) facts.push(t.behind({ ...behind, weeks: BEHIND_WINDOW_DAYS / 7 }));
  if (reliable.length > 0) {
    facts.push(t.reliable({ names: reliable.slice(0, NAMED_RELIABLE), more: Math.max(0, reliable.length - NAMED_RELIABLE) }));
  }

  const ideas: string[] = [];
  for (const s of insights.suggestions) {
    if (s.type === "REWARD_UPFRONT") ideas.push(t.rewardUpfront(s));
    else if (ideas.length >= PARENT_IDEAS) continue;
    else if (s.type === "OFFER_ARRANGEMENT") ideas.push(t.offerArrangement({ name: s.firstName, behindCents: s.behindCents }));
    else ideas.push(t.switchToWeekly({ name: s.firstName, rhythm: s.rhythm }));
  }
  return { facts, ideas };
}
