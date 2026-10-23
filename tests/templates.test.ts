import { describe, expect, it } from "vitest";
import { LANGUAGES, renderTemplate, templates } from "@/messaging/templates";

describe("message templates", () => {
  it("every language implements every template", () => {
    const keys = Object.keys(templates.en).sort();
    for (const lang of LANGUAGES) expect(Object.keys(templates[lang]).sort()).toEqual(keys);
  });

  it.each(LANGUAGES)("%s OTP message includes the code, expiry and the PIN warning, and no links", (lang) => {
    const body = renderTemplate(lang, "otp", { code: "048213", minutes: 5 });
    expect(body).toContain("048213");
    expect(body).toContain("5");
    expect(body).toContain("PIN");
    expect(body).not.toMatch(/https?:\/\/|www\./i);
    expect(body.length).toBeLessThanOrEqual(160 * 2); // at most two SMS segments
  });
});
