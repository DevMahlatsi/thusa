import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, mask, maskDigitsInText, redact } from "@/lib/logger";

afterEach(() => vi.restoreAllMocks());

describe("PII masking", () => {
  it("masks to the last four digits", () => {
    expect(mask("+27821234567")).toBe("••••4567");
    expect(mask("62001234321")).toBe("••••4321");
    expect(mask("12")).toBe("••••");
  });

  it("masks phone and account numbers inside free text", () => {
    expect(maskDigitsInText("send to +27 82 123 4567 now")).toBe("send to ••••4567 now");
    expect(maskDigitsInText("acc 62001234321")).toBe("acc ••••4321");
    expect(maskDigitsInText("retry 3 of 5 in 2026")).toBe("retry 3 of 5 in 2026");
  });

  it("masks sensitive keys whatever their value looks like", () => {
    expect(redact({ otp: "123456", token: "abc9876", accountNumber: "62001234321", nested: { phone: "0821234567" } })).toEqual({
      otp: "••••3456",
      token: "••••9876",
      accountNumber: "••••4321",
      nested: { phone: "••••4567" },
    });
  });

  it("never writes a raw phone number or code to the console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("otp for +27821234567", { to: "+27821234567", code: "654321" });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).not.toContain("821234567");
    expect(line).not.toContain("654321");
    expect(line).toContain("••••4567");
  });
});
