// CLEARLY FAKE sample data for the dashboard preview. Shown only until a business has real
// parents and collections (demo priorities 2–4). Names are "Parent A", "Child A", and every
// reference starts with SAMPLE- so nobody mistakes it for real money.
import type { CollectionRow, Rhythm } from "./dashboard";
import type { InsightPayer } from "./insights/parents";
import { addDays } from "./schedule-dates";

export const SAMPLE_YEAR = 2026;
export const SAMPLE_MONTH = 10;
export const SAMPLE_TODAY = "2026-10-23";

type SampleParent = {
  letter: string;
  rhythm: Rhythm;
  amountCents: number; // per collection
  firstDueDay: number;
  // What goes wrong with this parent's most recent collection that is already due.
  issue?: "PARTIAL" | "FAILED" | "LATE";
  // Pays two days before the due date.
  paysEarly?: boolean;
};

const PARENTS: SampleParent[] = [
  { letter: "A", rhythm: "MONTHLY", amountCents: 125_000, firstDueDay: 1 },
  { letter: "B", rhythm: "WEEKLY", amountCents: 30_000, firstDueDay: 2, issue: "PARTIAL" },
  { letter: "C", rhythm: "FORTNIGHTLY", amountCents: 60_000, firstDueDay: 2 },
  { letter: "D", rhythm: "MONTHLY", amountCents: 95_000, firstDueDay: 25 },
  { letter: "E", rhythm: "WEEKLY", amountCents: 25_000, firstDueDay: 2, issue: "LATE" },
  { letter: "F", rhythm: "MONTHLY", amountCents: 125_000, firstDueDay: 15, issue: "FAILED" },
  { letter: "G", rhythm: "FORTNIGHTLY", amountCents: 47_500, firstDueDay: 9 },
  { letter: "H", rhythm: "MONTHLY", amountCents: 110_000, firstDueDay: 1, paysEarly: true },
  { letter: "J", rhythm: "WEEKLY", amountCents: 20_000, firstDueDay: 6 },
  { letter: "K", rhythm: "MONTHLY", amountCents: 125_000, firstDueDay: 7 },
];

const STEP_DAYS: Record<Rhythm, number> = { WEEKLY: 7, FORTNIGHTLY: 14, MONTHLY: 31 };

const iso = (d: number) => `${SAMPLE_YEAR}-${String(SAMPLE_MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function sampleCollections(): CollectionRow[] {
  const todayDay = Number(SAMPLE_TODAY.slice(8));
  const rows: CollectionRow[] = [];
  for (const p of PARENTS) {
    const dueDays: number[] = [];
    for (let d = p.firstDueDay; d <= 31; d += STEP_DAYS[p.rhythm]) dueDays.push(d);
    const lastDue = Math.max(...dueDays.filter((d) => d <= todayDay), 0);

    for (const d of dueDays) {
      const isDue = d <= todayDay;
      const hasIssue = isDue && d === lastDue ? p.issue : undefined;
      const base = {
        id: `sample-${p.letter}-${d}`,
        payerId: `sample-${p.letter}`,
        parentName: `Parent ${p.letter}`,
        childName: `Child ${p.letter}`,
        reference: `SAMPLE-${p.letter}${String(d).padStart(2, "0")}`,
        rhythm: p.rhythm,
        dueDate: iso(d),
        amountCents: p.amountCents,
        requested: true,
        paymentUrl: null,
        balanceRequested: false,
        remindersSent: 0,
        remindedToday: false,
      };
      const unpaid = { paidOnTime: false, paidOn: null };
      if (!isDue) rows.push({ ...base, ...unpaid, paidCents: 0, status: "PENDING" });
      else if (hasIssue === "FAILED") rows.push({ ...base, ...unpaid, paidCents: 0, status: "FAILED" });
      else if (hasIssue === "PARTIAL") rows.push({ ...base, ...unpaid, paidCents: Math.floor(p.amountCents / 2), status: "PARTIAL" });
      else {
        const paidOn = addDays(iso(d), hasIssue === "LATE" ? 2 : p.paysEarly ? -2 : 0);
        rows.push({ ...base, paidCents: p.amountCents, status: "PAID", paidOnTime: hasIssue !== "LATE", paidOn });
      }
    }
  }
  return rows;
}

/** The sample parents for "This week in plain words". "Parent A" stands in for a first name. */
export function samplePayers(): InsightPayer[] {
  return PARENTS.map((p) => ({ id: `sample-${p.letter}`, firstName: `Parent ${p.letter}`, rhythm: p.rhythm, feeCents: p.amountCents }));
}
