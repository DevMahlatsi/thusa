// The /collections page's query handling and filters (src/lib/collections-view.ts), and which due dates can
// be sent from a row (canRequestNow, shared with the API).
import { describe, expect, it } from "vitest";
import { canRequestNow } from "@/lib/collections";
import { addMonths, collectionsHref, filterRows, parseCollectionsQuery, statusCounts } from "@/lib/collections-view";
import type { CollectionRow, CollectionStatus } from "@/lib/dashboard";

const current = { year: 2026, month: 10 };
const earliest = { year: 2026, month: 8 };

const row = (status: CollectionStatus, id: string = status): CollectionRow => ({
  id,
  payerId: `payer-${id}`,
  parentName: "Thandi Mokoena",
  childName: "Lerato",
  reference: "THK7Q2M9XA",
  rhythm: "WEEKLY",
  dueDate: "2026-10-23",
  amountCents: 35_000,
  paidCents: status === "PAID" ? 35_000 : 0,
  status,
  paidOnTime: false,
  paidOn: null,
  requested: true,
  paymentUrl: null,
  balanceRequested: false,
  remindersSent: 0,
  remindedToday: false,
});

describe("addMonths", () => {
  it("crosses years both ways", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 10 }, -14)).toEqual({ year: 2025, month: 8 });
  });
});

describe("parseCollectionsQuery", () => {
  const parse = (params: Record<string, string | string[] | undefined>) => parseCollectionsQuery(params, current, earliest);

  it("defaults to this month and every fee", () => {
    expect(parse({})).toEqual({ month: current, status: "all" });
  });

  it("reads a month and a status", () => {
    expect(parse({ month: "2026-09", status: "partial" })).toEqual({ month: { year: 2026, month: 9 }, status: "partial" });
    expect(parse({ month: ["2026-11", "2026-08"], status: ["paid"] })).toEqual({ month: { year: 2026, month: 11 }, status: "paid" });
  });

  it.each(["2026-13", "2026-00", "26-10", "2026-10-01", "x", "", "<script>"])("ignores the month %j", (month) => {
    expect(parse({ month }).month).toEqual(current);
  });

  it.each(["PAID", "everything", "", "all;drop"])("ignores the status %j", (status) => {
    expect(parse({ status }).status).toBe("all");
  });

  it("keeps the month between the first collection and next month", () => {
    expect(parse({ month: "2020-01" }).month).toEqual(earliest);
    expect(parse({ month: "2026-11" }).month).toEqual({ year: 2026, month: 11 });
    expect(parse({ month: "2027-05" }).month).toEqual({ year: 2026, month: 11 });
  });
});

describe("collectionsHref", () => {
  it("leaves this month and 'all' out of the link", () => {
    expect(collectionsHref(current, "all", current)).toBe("/collections");
    expect(collectionsHref(current, "paid", current)).toBe("/collections?status=paid");
    expect(collectionsHref({ year: 2026, month: 9 }, "all", current)).toBe("/collections?month=2026-09");
    expect(collectionsHref({ year: 2026, month: 9 }, "pending", current)).toBe("/collections?month=2026-09&status=pending");
  });
});

describe("filters", () => {
  const rows = [row("PAID", "a"), row("PAID", "b"), row("PARTIAL"), row("PENDING"), row("FAILED")];

  it("counts each status", () => {
    expect(statusCounts(rows)).toEqual({ all: 5, paid: 2, partial: 1, pending: 1, failed: 1 });
    expect(statusCounts([])).toEqual({ all: 0, paid: 0, partial: 0, pending: 0, failed: 0 });
  });

  it("filters by status", () => {
    expect(filterRows(rows, "all")).toBe(rows);
    expect(filterRows(rows, "paid").map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterRows(rows, "partial").map((r) => r.status)).toEqual(["PARTIAL"]);
  });
});

describe("canRequestNow", () => {
  const today = "2026-10-24";
  it("allows this month's fees up to 7 days ahead, including past ones", () => {
    expect(canRequestNow("2026-10-01", today)).toBe(true);
    expect(canRequestNow("2026-10-24", today)).toBe(true);
    expect(canRequestNow("2026-10-31", today)).toBe(true);
    expect(canRequestNow("2026-10-26", "2026-10-18")).toBe(false);
  });

  it("refuses other months", () => {
    expect(canRequestNow("2026-09-30", today)).toBe(false);
    expect(canRequestNow("2026-11-01", "2026-10-28")).toBe(false);
  });
});
