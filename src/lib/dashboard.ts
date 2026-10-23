// Dashboard view model. Pure functions over collection rows, so the same maths serves the sample
// preview, schedules projected onto this month, and real collections later. All money is integer cents.
import { dueDatesInMonth } from "./schedule-dates";

export type Rhythm = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
export type CollectionStatus = "PENDING" | "PAID" | "PARTIAL" | "FAILED";

export type CollectionRow = {
  id: string;
  payerId: string;
  parentName: string;
  childName: string;
  reference: string;
  rhythm: Rhythm;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
  paidCents: number;
  status: CollectionStatus;
  paidOnTime: boolean;
};

export type Kpis = {
  expectedCents: number;
  receivedCents: number;
  outstandingCents: number;
  onTimeRate: number | null; // 0–1 over collections due so far; null when none are due yet
  dueSoFar: number;
};

export type WeekBucket = {
  label: string; // "1–7 Oct"
  shortLabel: string; // "1–7", for narrow charts
  startDay: number;
  endDay: number;
  expectedCents: number;
  receivedCents: number;
  isCurrent: boolean;
};

export type ParentSummary = {
  payerId: string;
  parentName: string;
  childName: string;
  rhythm: Rhythm;
  status: CollectionStatus;
  receivedCents: number;
  expectedCents: number;
};

const day = (isoDate: string) => Number(isoDate.slice(8, 10));

export function computeKpis(rows: CollectionRow[], today: string): Kpis {
  const expectedCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const receivedCents = rows.reduce((sum, r) => sum + r.paidCents, 0);
  const due = rows.filter((r) => r.dueDate <= today);
  const onTime = due.filter((r) => r.status === "PAID" && r.paidOnTime).length;
  return {
    expectedCents,
    receivedCents,
    outstandingCents: expectedCents - receivedCents,
    onTimeRate: due.length ? onTime / due.length : null,
    dueSoFar: due.length,
  };
}

/** Calendar weeks of the month: 1–7, 8–14, 15–21, 22–28, 29–end. */
export function weeklyBuckets(rows: CollectionRow[], year: number, month: number, today: string): WeekBucket[] {
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-ZA", { month: "short", timeZone: "UTC" });
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayDay = day(today);
  const buckets: WeekBucket[] = [];
  for (let start = 1; start <= lastDay; start += 7) {
    const end = Math.min(start + 6, lastDay);
    const inWeek = rows.filter((r) => day(r.dueDate) >= start && day(r.dueDate) <= end);
    const shortLabel = start === end ? `${start}` : `${start}–${end}`;
    buckets.push({
      label: `${shortLabel} ${monthName}`,
      shortLabel,
      startDay: start,
      endDay: end,
      expectedCents: inWeek.reduce((sum, r) => sum + r.amountCents, 0),
      receivedCents: inWeek.reduce((sum, r) => sum + r.paidCents, 0),
      isCurrent: todayDay >= start && todayDay <= end,
    });
  }
  return buckets;
}

const STATUS_PRIORITY: Record<CollectionStatus, number> = { FAILED: 0, PARTIAL: 1, PENDING: 2, PAID: 3 };

/**
 * One line per parent for "Who's paid". A parent is PAID when everything due so far is paid,
 * otherwise their worst status wins. Problems sort to the top.
 */
export function summariseParents(rows: CollectionRow[], today: string): ParentSummary[] {
  const byParent = new Map<string, CollectionRow[]>();
  for (const row of rows) byParent.set(row.payerId, [...(byParent.get(row.payerId) ?? []), row]);

  const summaries = [...byParent.values()].map((parentRows): ParentSummary => {
    const first = parentRows[0]!;
    const due = parentRows.filter((r) => r.dueDate <= today);
    const worst = due.reduce<CollectionStatus>(
      (acc, r) => (STATUS_PRIORITY[r.status] < STATUS_PRIORITY[acc] ? r.status : acc),
      "PAID",
    );
    return {
      payerId: first.payerId,
      parentName: first.parentName,
      childName: first.childName,
      rhythm: first.rhythm,
      status: due.length === 0 ? "PENDING" : worst,
      receivedCents: due.reduce((sum, r) => sum + r.paidCents, 0),
      expectedCents: due.reduce((sum, r) => sum + r.amountCents, 0),
    };
  });

  return summaries.sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.parentName.localeCompare(b.parentName),
  );
}

export type ScheduledPayer = {
  id: string;
  parentName: string;
  childName: string;
  schedule: { amountCents: number; rhythm: Rhythm; payday: number; startsOn: string } | null;
};

/**
 * What each schedule expects this month, before any payment request exists: one PENDING row per due
 * date with nothing paid. The amount comes from the stored schedule. No reference until one is sent.
 */
export function projectSchedules(payers: ScheduledPayer[], year: number, month: number): CollectionRow[] {
  return payers.flatMap(({ id, parentName, childName, schedule }) =>
    schedule
      ? dueDatesInMonth(schedule, year, month).map((dueDate) => ({
          id: `${id}:${dueDate}`,
          payerId: id,
          parentName,
          childName,
          reference: "",
          rhythm: schedule.rhythm,
          dueDate,
          amountCents: schedule.amountCents,
          paidCents: 0,
          status: "PENDING" as const,
          paidOnTime: false,
        }))
      : [],
  );
}

export const RHYTHM_LABEL: Record<Rhythm, string> = { WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly", MONTHLY: "Monthly" };
export const STATUS_LABEL: Record<CollectionStatus, string> = {
  PAID: "Paid",
  PENDING: "Pending",
  PARTIAL: "Partial",
  FAILED: "Failed",
};
