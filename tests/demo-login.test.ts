import { describe, expect, it } from "vitest";
import { formatSaMobile, parseDemoLogin } from "@/lib/auth/demo";

describe("parseDemoLogin", () => {
  it("is off when neither variable is set", () => {
    expect(parseDemoLogin({})).toBeNull();
    expect(parseDemoLogin({ DEMO_PHONE: "", DEMO_OTP: "" })).toBeNull();
  });

  it("normalises the demo phone", () => {
    expect(parseDemoLogin({ DEMO_PHONE: "060 000 0000", DEMO_OTP: "123456" })).toEqual({
      phoneE164: "+27600000000",
      code: "123456",
    });
  });

  it.each([
    [{ DEMO_PHONE: "0600000000" }],
    [{ DEMO_OTP: "123456" }],
    [{ DEMO_PHONE: "0111234567", DEMO_OTP: "123456" }], // landline
    [{ DEMO_PHONE: "0600000000", DEMO_OTP: "12345" }],
    [{ DEMO_PHONE: "0600000000", DEMO_OTP: "abcdef" }],
  ])("refuses half or invalid config %j", (source) => {
    expect(() => parseDemoLogin(source)).toThrow(/demo login configuration/);
  });
});

describe("formatSaMobile", () => {
  it("formats for display", () => {
    expect(formatSaMobile("+27600000000")).toBe("060 000 0000");
  });
});
