import { describe, expect, it } from "vitest";
import { normaliseSaMobile, saMobileSchema } from "@/lib/phone";

describe("normaliseSaMobile", () => {
  it.each([
    ["0821234567", "+27821234567"],
    ["082 123 4567", "+27821234567"],
    ["082-123-4567", "+27821234567"],
    ["27821234567", "+27821234567"],
    ["+27 82 123 4567", "+27821234567"],
    ["0612345678", "+27612345678"],
    ["0731234567", "+27731234567"],
  ])("normalises %s", (input, expected) => {
    expect(normaliseSaMobile(input)).toBe(expected);
  });

  it.each(["", "12345", "0112345678" /* landline */, "08212345678" /* too long */, "+447911123456", "abc"])(
    "rejects %s",
    (input) => {
      expect(normaliseSaMobile(input)).toBeNull();
    },
  );

  it("gives a friendly validation message", () => {
    const result = saMobileSchema.safeParse("011 123 4567");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/South African cellphone/);
  });
});
