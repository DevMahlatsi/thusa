import type { CollectionRow, Rhythm } from "../dashboard";
import { addDays } from "../schedule-dates";

// What each parent's recent fees say about them: a badge and how far behind they are. Only fees that
// were sent count: a due date the owner never asked for is not the parent's fault. A fee due today can
// still be paid today, so only fees due before today count.

// Being behind is about recent fees: the last five weeks.
export const BEHIND_WINDOW_DAYS = 35;
// Unpaid this long after its due date, one fee is enough for NEEDS_SUPPORT.
export const LONG_UNPAID_DAYS = 7;
// Fewer sent fees than this so far: NEW.
export const NEW_BELOW_FEES = 3;
// RELIABLE: this many of the latest fees (or 3, if that's all there is) all paid on time.
export const RELIABLE_FEES = 4;
// Months of history loaded for NEW and RELIABLE: enough for four monthly fees before today.
export const HISTORY_MONTHS = 4;
// The AI gets this many parents at most, to keep requests small.
export const TOP_PARENTS = 10;

export type Badge = "NEEDS_SUPPORT" | "NEW" | "RELIABLE" | "ON_TRACK";

/** An active parent with a schedule. Only the first name: insights never see surnames or children. */
export type InsightPayer = { id: string; firstName: string; rhythm: Rhythm; feeCents: number };

export type ParentInsight = InsightPayer & {
  badge: Badge;
  // Amount − paid over sent fees due in the last BEHIND_WINDOW_DAYS days (never below 0).
  behindCents: number;
  // Paid a sent fee in full before its due date, in the last BEHIND_WINDOW_DAYS days or ahead of a fee
  // still to come.
  paidEarly: boolean;
};

// Titles skipped when finding a first name. The spec's list, plus the matching male and grandparent forms.
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "mme", "ntate", "rre", "gogo", "mkhulu"]);

/**
 * The first word of a parent's name, skipping titles: "Mrs Thandi Mokoena" -> "Thandi". A title with only
 * one word after it is kept with it ("Mr Dlamini"): that word is most likely the surname.
 */
export function firstName(parentName: string): string {
  const words = parentName.trim().split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && TITLES.has(words[i]!.toLowerCase().replace(/\.$/, ""))) i++;
  if (i > 0 && i === words.length - 1) return words.slice(i - 1).join(" ");
  return words[i] ?? "";
}

/** The first day loaded for the insights: the first of the month HISTORY_MONTHS before today's. */
export function historyStart(today: string): string {
  const i = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - HISTORY_MONTHS;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
}

const shortCents = (r: CollectionRow) => r.amountCents - r.paidCents;

/** One parent's insight from all of their rows (any order). */
export function parentInsight(payer: InsightPayer, rows: CollectionRow[], today: string): ParentInsight {
  const windowStart = addDays(today, -BEHIND_WINDOW_DAYS);
  const sent = rows.filter((r) => r.requested);
  // Newest first.
  const pastDue = sent.filter((r) => r.dueDate < today).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const recent = pastDue.filter((r) => r.dueDate >= windowStart);
  const unpaid = recent.filter((r) => shortCents(r) > 0);

  let badge: Badge;
  if (unpaid.length >= 2 || unpaid.some((r) => r.dueDate <= addDays(today, -LONG_UNPAID_DAYS))) badge = "NEEDS_SUPPORT";
  else if (pastDue.length < NEW_BELOW_FEES) badge = "NEW";
  else if (pastDue.slice(0, RELIABLE_FEES).every((r) => r.status === "PAID" && r.paidOnTime)) badge = "RELIABLE";
  else badge = "ON_TRACK";

  return {
    ...payer,
    badge,
    behindCents: Math.max(0, recent.reduce((sum, r) => sum + shortCents(r), 0)),
    paidEarly: sent.some((r) => r.dueDate >= windowStart && r.status === "PAID" && r.paidOn !== null && r.paidOn < r.dueDate),
  };
}

// Who the owner most needs to hear about: parents who need support, then anyone behind, then the
// reliable ones (money to count on), then the rest.
const rank = (p: ParentInsight) =>
  p.badge === "NEEDS_SUPPORT" ? 0 : p.behindCents > 0 ? 1 : { RELIABLE: 2, ON_TRACK: 3, NEW: 4 }[p.badge];

/** Most relevant first: by rank, then the most behind, then by name. */
export function byRelevance(a: ParentInsight, b: ParentInsight): number {
  return (
    rank(a) - rank(b) ||
    b.behindCents - a.behindCents ||
    a.firstName.localeCompare(b.firstName, "en-ZA") ||
    a.id.localeCompare(b.id)
  );
}
