import { z } from "zod";
import type { CollectionRow, CollectionStatus } from "./dashboard";

// The /collections page: one month of fees, filtered by status. Pure helpers, so the page stays thin and
// the query handling can be tested.

export const STATUS_FILTERS = ["all", "paid", "partial", "pending", "failed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

const FILTER_STATUS: Record<Exclude<StatusFilter, "all">, CollectionStatus> = {
  paid: "PAID",
  partial: "PARTIAL",
  pending: "PENDING",
  failed: "FAILED",
};

export type Month = { year: number; month: number }; // month is 1–12

const monthKey = ({ year, month }: Month) => `${year}-${String(month).padStart(2, "0")}`;

export function addMonths({ year, month }: Month, n: number): Month {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export const compareMonths = (a: Month, b: Month) => monthKey(a).localeCompare(monthKey(b));

const searchSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  status: z.enum(STATUS_FILTERS).optional().catch(undefined),
});

/**
 * Reads ?month=YYYY-MM&status=… Anything missing or malformed falls back to this month and all fees, and
 * the month is kept between `earliest` and the month after this one.
 */
export function parseCollectionsQuery(
  params: Record<string, string | string[] | undefined>,
  current: Month,
  earliest: Month,
): { month: Month; status: StatusFilter } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = searchSchema.parse({ month: first(params.month), status: first(params.status) });
  let month = parsed.month ? { year: Number(parsed.month.slice(0, 4)), month: Number(parsed.month.slice(5, 7)) } : current;
  const latest = addMonths(current, 1);
  if (compareMonths(month, earliest) < 0) month = earliest;
  if (compareMonths(month, latest) > 0) month = latest;
  return { month, status: parsed.status ?? "all" };
}

/** The page's own URL for a month and filter. This month and "all" are left out, to keep links short. */
export function collectionsHref(month: Month, status: StatusFilter, current: Month): string {
  const params = new URLSearchParams();
  if (compareMonths(month, current) !== 0) params.set("month", monthKey(month));
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query ? `/collections?${query}` : "/collections";
}

export function filterRows(rows: CollectionRow[], status: StatusFilter): CollectionRow[] {
  return status === "all" ? rows : rows.filter((r) => r.status === FILTER_STATUS[status]);
}

/** How many rows each filter would show. */
export function statusCounts(rows: CollectionRow[]): Record<StatusFilter, number> {
  const counts = { all: rows.length, paid: 0, partial: 0, pending: 0, failed: 0 };
  for (const r of rows) counts[r.status.toLowerCase() as Exclude<StatusFilter, "all">]++;
  return counts;
}
