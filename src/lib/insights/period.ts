import { addDays } from "../schedule-dates";

// The week the insights talk about: the last seven days up to and including today, SA time. It crosses
// month ends (26 Oct – 1 Nov 2026), so callers load more than one month of rows.

export const PERIOD_DAYS = 7;

// Fixed, not toLocaleString: ICU versions disagree on short month names ("Sep" or "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Period = {
  start: string; // YYYY-MM-DD
  end: string; // today
  label: string; // "19–25 Oct 2026"
};

const parts = (ymd: string) => ({ year: ymd.slice(0, 4), month: MONTHS[Number(ymd.slice(5, 7)) - 1]!, day: Number(ymd.slice(8, 10)) });

/** "19–25 Oct 2026", "26 Oct – 1 Nov 2026" or "28 Dec 2026 – 3 Jan 2027". */
export function periodLabel(start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  if (s.year !== e.year) return `${s.day} ${s.month} ${s.year} – ${e.day} ${e.month} ${e.year}`;
  if (s.month !== e.month) return `${s.day} ${s.month} – ${e.day} ${e.month} ${e.year}`;
  return `${s.day}–${e.day} ${e.month} ${e.year}`;
}

export function insightPeriod(today: string): Period {
  const start = addDays(today, -(PERIOD_DAYS - 1));
  return { start, end: today, label: periodLabel(start, today) };
}
