import { describe, expect, it } from "vitest";
import { formatRand, formatRandAxis } from "@/lib/money";

const S = " ";

describe("formatRand", () => {
  it.each([
    [0, `+R${S}0.00`],
    [5, `+R${S}0.05`],
    [50_900, `+R${S}509.00`],
    [125_000, `+R${S}1${S}250.00`],
    [100_000_000, `+R${S}1${S}000${S}000.00`],
    [-8_000, `−R${S}80.00`],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(formatRand(cents)).toBe(expected);
  });

  it("always shows a sign, never relying on colour alone", () => {
    for (const cents of [0, 1, -1, 99_999]) expect(formatRand(cents)).toMatch(/^[+−]R/);
  });

  it("refuses non-integer amounts", () => {
    expect(() => formatRand(10.5)).toThrow();
  });
});

describe("formatRandAxis", () => {
  it.each([
    [0, `R${S}0`],
    [50_000, `R${S}500`],
    [200_000, `R${S}2k`],
    [1_250_000, `R${S}12.5k`],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(formatRandAxis(cents)).toBe(expected);
  });
});
