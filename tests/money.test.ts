import { describe, expect, it } from "vitest";
import { centsToRandInput, formatPayment, formatRand, formatRandAxis, parseRandToCents } from "@/lib/money";

const S = " ";

describe("formatRand", () => {
  it.each([
    [0, `R${S}0.00`],
    [5, `R${S}0.05`],
    [50_900, `R${S}509.00`],
    [125_000, `R${S}1${S}250.00`],
    [100_000_000, `R${S}1${S}000${S}000.00`],
    [-8_000, `−R${S}80.00`],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(formatRand(cents)).toBe(expected);
  });

  it("never puts a plus on a total, fee or balance", () => {
    for (const cents of [0, 1, 99_999, 608_000]) expect(formatRand(cents)).toMatch(/^R/);
  });

  it("refuses non-integer amounts", () => {
    expect(() => formatRand(10.5)).toThrow();
  });
});

describe("formatPayment", () => {
  it.each([
    [17_500, `+R${S}175.00`],
    [125_000, `+R${S}1${S}250.00`],
    [-8_000, `−R${S}80.00`],
  ])("formats a payment of %i cents as %s", (cents, expected) => {
    expect(formatPayment(cents)).toBe(expected);
  });

  it("refuses non-integer amounts", () => {
    expect(() => formatPayment(10.5)).toThrow();
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

describe("parseRandToCents", () => {
  it.each([
    ["350", 35_000],
    ["350.5", 35_050],
    ["350.50", 35_050],
    ["350,50", 35_050],
    ["R 1 250.00", 125_000],
    [`1${S}250`, 125_000],
    ["1,250", 125_000],
    ["1,250.75", 125_075],
    ["0.10", 10],
    // Floats would make this 1999.9999…; the text-based parse can't.
    ["19.99", 1_999],
  ])("parses %s as %i cents", (input, cents) => {
    expect(parseRandToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-50", "12.345", "1,2345", "1e3", "12.", ".5", "R"])("rejects %s", (input) => {
    expect(parseRandToCents(input)).toBeNull();
  });
});

describe("centsToRandInput", () => {
  it("round-trips through parseRandToCents", () => {
    for (const cents of [1, 99, 35_000, 125_075]) expect(parseRandToCents(centsToRandInput(cents))).toBe(cents);
    expect(centsToRandInput(125_000)).toBe("1250.00");
  });
});
