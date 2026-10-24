import type { Rhythm } from "./dashboard";

// Which days a schedule falls due. Pure date maths on YYYY-MM-DD strings in UTC, so there is no
// time-zone drift; "today" is worked out in SA time by the caller.

export type ScheduleDates = {
  rhythm: Rhythm;
  payday: number; // WEEKLY/FORTNIGHTLY: ISO weekday 1–7. MONTHLY: day of month 1–31.
  startsOn: string; // YYYY-MM-DD
};

const DAY_MS = 86_400_000;
const toUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isoWeekday = (ms: number) => new Date(ms).getUTCDay() || 7;

/** Due dates of this schedule in the given month (month is 1–12), oldest first. */
export function dueDatesInMonth(schedule: ScheduleDates, year: number, month: number): string[] {
  const first = Date.UTC(year, month - 1, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = toUtc(schedule.startsOn);

  if (schedule.rhythm === "MONTHLY") {
    // Short months use their last day.
    const due = Date.UTC(year, month - 1, Math.min(schedule.payday, lastDay));
    return due >= start ? [toYmd(due)] : [];
  }

  // Fortnights count from the first payday on or after startsOn.
  const anchor = start + ((schedule.payday - isoWeekday(start) + 7) % 7) * DAY_MS;
  const step = schedule.rhythm === "WEEKLY" ? 7 : 14;
  const dates: string[] = [];
  for (let d = 0; d < lastDay; d++) {
    const ms = first + d * DAY_MS;
    if (ms >= anchor && ((ms - anchor) / DAY_MS) % step === 0) dates.push(toYmd(ms));
  }
  return dates;
}

/** The date `days` after a YYYY-MM-DD date (negative goes back). */
export function addDays(ymd: string, days: number): string {
  return toYmd(toUtc(ymd) + days * DAY_MS);
}
