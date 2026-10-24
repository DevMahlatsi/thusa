import { describe, expect, it } from "vitest";
import { smsParts, toGsm } from "@/messaging/sms";

describe("toGsm", () => {
  it("keeps GSM text as it is, accents in the GSM alphabet included", () => {
    expect(toGsm("Crèche R1 250.00 Ref THK7Q2M9XA. Don't share it!")).toBe("Crèche R1 250.00 Ref THK7Q2M9XA. Don't share it!");
  });

  it("folds curly quotes, dashes and special spaces to plain ones", () => {
    expect(toGsm("Lerato’s fee – R 300")).toBe("Lerato's fee - R 300");
  });

  it("drops accents the GSM alphabet doesn't have and replaces anything else with ?", () => {
    expect(toGsm("Thandí Ŋcobo")).toBe("Thandi ?cobo");
    expect(toGsm("emoji 😀")).toBe("emoji ?");
  });
});

describe("smsParts", () => {
  it("counts 160 GSM characters as one SMS and 153 per part after that", () => {
    expect(smsParts("a".repeat(160))).toBe(1);
    expect(smsParts("a".repeat(161))).toBe(2);
    expect(smsParts("a".repeat(306))).toBe(2);
    expect(smsParts("a".repeat(307))).toBe(3);
  });

  it("counts GSM extension characters as two", () => {
    expect(smsParts("[".repeat(80))).toBe(1);
    expect(smsParts("[".repeat(81))).toBe(2);
  });

  it("drops to 70 per SMS (67 per part) once any character is outside GSM", () => {
    expect(smsParts("ŋ".repeat(70))).toBe(1);
    expect(smsParts("ŋ" + "a".repeat(70))).toBe(2);
    expect(smsParts("ŋ" + "a".repeat(200))).toBe(3);
  });
});
