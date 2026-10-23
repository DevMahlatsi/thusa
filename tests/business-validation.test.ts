import { describe, expect, it } from "vitest";
import { businessProfileSchema } from "@/lib/business";

const valid = { name: "Sunshine Crèche", town: "Soweto", province: "GP", ecdRegistrationNumber: "", defaultLanguage: "zu" };

describe("businessProfileSchema", () => {
  it("accepts a valid profile and turns blank optionals into null", () => {
    const parsed = businessProfileSchema.parse(valid);
    expect(parsed).toEqual({ ...valid, ecdRegistrationNumber: null });
  });

  it("rejects a smuggled businessId so a client can't target another business", () => {
    const result = businessProfileSchema.safeParse({ ...valid, businessId: "someone-elses-business" });
    expect(result.success).toBe(false);
  });

  it.each([
    [{ ...valid, name: " " }, /business name/i],
    [{ ...valid, province: "XX" }, /province/i],
    [{ ...valid, defaultLanguage: "fr" }, /.+/],
    [{ ...valid, ecdRegistrationNumber: "<script>" }, /registration number/i],
  ])("rejects invalid input %#", (input, message) => {
    const result = businessProfileSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(message);
  });
});
