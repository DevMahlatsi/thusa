import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS, payerInputSchema, todayInSa } from "@/lib/payers";

const schedule = { amountCents: 12_500, rhythm: "WEEKLY", payday: 5 };
const valid = { parentName: "Thandi Mokoena", childName: "Lerato", phone: "082 123 4567", language: "st", schedule };

const firstIssue = (input: unknown) => {
  const result = payerInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error?.issues[0];
};

describe("payerInputSchema", () => {
  it("accepts a valid payer and normalises the phone", () => {
    expect(payerInputSchema.parse(valid)).toEqual({ ...valid, phone: "+27821234567" });
  });

  it("defaults the language to the business's when left out", () => {
    expect(payerInputSchema.parse({ ...valid, language: undefined }).language).toBeNull();
    expect(payerInputSchema.parse({ ...valid, language: null }).language).toBeNull();
  });

  it("accepts names with accents, apostrophes and hyphens", () => {
    expect(() => payerInputSchema.parse({ ...valid, parentName: "Nomsa O'Neil-Dlamini", childName: "Zoë" })).not.toThrow();
  });

  it("rejects a smuggled businessId, at the top level or in the schedule", () => {
    expect(payerInputSchema.safeParse({ ...valid, businessId: "someone-elses" }).success).toBe(false);
    expect(payerInputSchema.safeParse({ ...valid, schedule: { ...schedule, businessId: "x" } }).success).toBe(false);
  });

  it.each([
    [{ ...valid, childName: "  " }, /child's name/],
    [{ ...valid, parentName: "Visit https://evil.example" }, /parent's name/],
    [{ ...valid, childName: "<b>Lerato</b>" }, /child's name/],
    [{ ...valid, phone: "011 123 4567" }, /cellphone/],
    [{ ...valid, language: "fr" }, /.+/],
  ])("rejects invalid payer details %#", (input, message) => {
    expect(firstIssue(input)?.message).toMatch(message);
  });

  it.each([
    [{ amountCents: 125.5 }, /whole cents/],
    [{ amountCents: "12500" }, /amount/i],
    [{ amountCents: 0 }, /more than/],
    [{ amountCents: -100 }, /more than/],
    [{ amountCents: MAX_AMOUNT_CENTS + 1 }, /too large/],
    [{ rhythm: "DAILY" }, /weekly/],
    [{ payday: 0 }, /payday/],
    [{ payday: 8 }, /payday/],
    [{ rhythm: "FORTNIGHTLY", payday: 8 }, /payday/],
    [{ rhythm: "MONTHLY", payday: 32 }, /payday/],
    [{ payday: 2.5 }, /payday/],
    [{ startsOn: "2026-02-30" }, /exist/],
    [{ startsOn: "1/11/2026" }, /date/],
  ])("rejects an invalid schedule %#", (change, message) => {
    expect(firstIssue({ ...valid, schedule: { ...schedule, ...change } })?.message).toMatch(message);
  });

  it("allows month days up to 31 for monthly schedules only", () => {
    expect(payerInputSchema.safeParse({ ...valid, schedule: { ...schedule, rhythm: "MONTHLY", payday: 31 } }).success).toBe(true);
    expect(payerInputSchema.safeParse({ ...valid, schedule: { ...schedule, rhythm: "WEEKLY", payday: 25 } }).success).toBe(false);
  });
});

describe("todayInSa", () => {
  it("uses South African time, not UTC", () => {
    expect(todayInSa(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01");
    expect(todayInSa(new Date("2026-10-31T21:59:00Z"))).toBe("2026-10-31");
  });
});
