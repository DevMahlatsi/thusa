import { describe, expect, it } from "vitest";
import { splitMonthlyFee } from "@/lib/fee-split";

describe("splitMonthlyFee", () => {
  it("keeps the monthly fee as it is", () => {
    expect(splitMonthlyFee(120_000, "MONTHLY")).toBe(120_000);
  });

  it("spreads a year's fees over 26 fortnights or 52 weeks, rounded half up to the cent", () => {
    // R 1 200 x 12 = R 14 400 a year: / 26 = 553.846… and / 52 = 276.923…
    expect(splitMonthlyFee(120_000, "FORTNIGHTLY")).toBe(55_385);
    expect(splitMonthlyFee(120_000, "WEEKLY")).toBe(27_692);
    // 13 x 12 / 52 = 3 exactly; 1 x 12 / 26 = 0.46 rounds down; 13 x 12 / 26 = 6 exactly.
    expect(splitMonthlyFee(13, "WEEKLY")).toBe(3);
    expect(splitMonthlyFee(1, "FORTNIGHTLY")).toBe(0);
    expect(splitMonthlyFee(13, "FORTNIGHTLY")).toBe(6);
  });

  it("rounds to the nearest cent", () => {
    // Weekly is n x 3/13 and fortnightly n x 6/13, so the fraction is always k/13 and never exactly a half.
    for (let n = 100; n < 5_000; n += 37) {
      expect(splitMonthlyFee(n, "WEEKLY")).toBe(Math.round((n * 12) / 52));
      expect(splitMonthlyFee(n, "FORTNIGHTLY")).toBe(Math.round((n * 12) / 26));
    }
  });

  it("gives whole cents, and a year of weekly or fortnightly fees is within a few cents of 12 months", () => {
    for (const monthly of [35_000, 50_900, 145_000, 10_000_000]) {
      for (const [rhythm, perYear] of [["WEEKLY", 52], ["FORTNIGHTLY", 26]] as const) {
        const each = splitMonthlyFee(monthly, rhythm);
        expect(Number.isInteger(each)).toBe(true);
        expect(Math.abs(each * perYear - monthly * 12)).toBeLessThanOrEqual(perYear / 2);
      }
    }
  });

  it("refuses amounts that aren't positive whole cents", () => {
    expect(() => splitMonthlyFee(0, "WEEKLY")).toThrow();
    expect(() => splitMonthlyFee(-100, "MONTHLY")).toThrow();
    expect(() => splitMonthlyFee(100.5, "WEEKLY")).toThrow();
  });
});
