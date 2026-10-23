import { describe, expect, it } from "vitest";
import { computeKpis, projectSchedules, summariseParents, weeklyBuckets, type CollectionRow } from "@/lib/dashboard";
import { SAMPLE_MONTH, SAMPLE_TODAY, SAMPLE_YEAR, sampleCollections } from "@/lib/sample-dashboard";

const row = (over: Partial<CollectionRow>): CollectionRow => ({
  id: "1",
  payerId: "p",
  parentName: "P",
  childName: "C",
  reference: "R",
  rhythm: "MONTHLY",
  dueDate: "2026-10-01",
  amountCents: 10_000,
  paidCents: 10_000,
  status: "PAID",
  paidOnTime: true,
  ...over,
});

describe("computeKpis", () => {
  it("sums in integer cents and measures on-time rate over collections already due", () => {
    const kpis = computeKpis(
      [
        row({ id: "a" }),
        row({ id: "b", paidOnTime: false }),
        row({ id: "c", status: "PARTIAL", paidCents: 5_000 }),
        row({ id: "d", dueDate: "2026-10-30", status: "PENDING", paidCents: 0 }),
      ],
      "2026-10-23",
    );
    expect(kpis).toEqual({
      expectedCents: 40_000,
      receivedCents: 25_000,
      outstandingCents: 15_000,
      onTimeRate: 1 / 3,
      dueSoFar: 3,
    });
  });

  it("has no on-time rate before anything is due", () => {
    expect(computeKpis([row({ dueDate: "2026-10-30", status: "PENDING", paidCents: 0 })], "2026-10-01").onTimeRate).toBeNull();
  });
});

describe("weeklyBuckets", () => {
  it("splits the month into calendar weeks and marks the current one", () => {
    const buckets = weeklyBuckets([row({ dueDate: "2026-10-23" }), row({ dueDate: "2026-10-31" })], 2026, 10, "2026-10-23");
    expect(buckets.map((b) => b.label)).toEqual(["1–7 Oct", "8–14 Oct", "15–21 Oct", "22–28 Oct", "29–31 Oct"]);
    expect(buckets.find((b) => b.isCurrent)?.label).toBe("22–28 Oct");
    expect(buckets.reduce((s, b) => s + b.expectedCents, 0)).toBe(20_000);
  });
});

describe("summariseParents", () => {
  it("shows the worst status due so far and sorts problems first", () => {
    const list = summariseParents(
      [
        row({ payerId: "1", parentName: "Paid" }),
        row({ payerId: "2", parentName: "Failed", status: "FAILED", paidCents: 0 }),
        row({ payerId: "3", parentName: "Upcoming", dueDate: "2026-10-30", status: "PENDING", paidCents: 0 }),
        row({ payerId: "4", parentName: "Partial", status: "PARTIAL", paidCents: 5_000 }),
      ],
      "2026-10-23",
    );
    expect(list.map((p) => [p.parentName, p.status])).toEqual([
      ["Failed", "FAILED"],
      ["Partial", "PARTIAL"],
      ["Upcoming", "PENDING"],
      ["Paid", "PAID"],
    ]);
  });

  it("keeps two parents with the same name apart", () => {
    const list = summariseParents(
      [row({ payerId: "1", parentName: "Thandi" }), row({ payerId: "2", parentName: "Thandi", status: "FAILED", paidCents: 0 })],
      "2026-10-23",
    );
    expect(list.map((p) => [p.payerId, p.status])).toEqual([
      ["2", "FAILED"],
      ["1", "PAID"],
    ]);
  });
});

describe("projectSchedules", () => {
  const payers = [
    { id: "a", parentName: "A", childName: "a", schedule: { amountCents: 30_000, rhythm: "WEEKLY" as const, payday: 5, startsOn: "2026-01-01" } },
    { id: "b", parentName: "B", childName: "b", schedule: { amountCents: 125_000, rhythm: "MONTHLY" as const, payday: 25, startsOn: "2026-01-01" } },
    { id: "c", parentName: "C", childName: "c", schedule: null },
  ];

  it("expects each schedule's amount on each due date, with nothing received yet", () => {
    const rows = projectSchedules(payers, 2026, 10);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.status === "PENDING" && r.paidCents === 0 && r.reference === "")).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(computeKpis(rows, "2026-10-23")).toMatchObject({ expectedCents: 5 * 30_000 + 125_000, receivedCents: 0 });
  });

  it("puts every parent with a schedule in Who's paid, nobody up to date yet", () => {
    const list = summariseParents(projectSchedules(payers, 2026, 10), "2026-10-23");
    expect(list.map((p) => [p.payerId, p.status, p.expectedCents])).toEqual([
      ["a", "PENDING", 4 * 30_000],
      ["b", "PENDING", 0],
    ]);
  });
});

describe("sample data", () => {
  const rows = sampleCollections();

  it("is unmistakably fake", () => {
    for (const r of rows) {
      expect(r.parentName).toMatch(/^Parent [A-Z]$/);
      expect(r.reference).toMatch(/^SAMPLE-/);
    }
  });

  it("uses integer cents, unique references, and covers every status", () => {
    expect(rows.every((r) => Number.isInteger(r.amountCents) && Number.isInteger(r.paidCents))).toBe(true);
    expect(new Set(rows.map((r) => r.reference)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["PAID", "PENDING", "PARTIAL", "FAILED"]));
  });

  it("weekly buckets add up to the KPI totals", () => {
    const kpis = computeKpis(rows, SAMPLE_TODAY);
    const buckets = weeklyBuckets(rows, SAMPLE_YEAR, SAMPLE_MONTH, SAMPLE_TODAY);
    expect(buckets.reduce((s, b) => s + b.expectedCents, 0)).toBe(kpis.expectedCents);
    expect(buckets.reduce((s, b) => s + b.receivedCents, 0)).toBe(kpis.receivedCents);
  });
});
