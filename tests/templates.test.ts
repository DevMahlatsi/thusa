import { describe, expect, it } from "vitest";
import { MAX_SMS_PARTS, smsParts, toGsm } from "@/messaging/sms";
import { LANGUAGES, renderTemplate, templates, type FeeParams, type InviteLink, type PaymentLink } from "@/messaging/templates";
import { plainName, smsDate, smsRand } from "@/messaging/templates/format";

const FEE_TEMPLATES = ["payment_request", "payment_reminder", "balance_request"] as const;

const link = "https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa" as PaymentLink;
const fee: FeeParams & { paidCents: number } = {
  business: "Sunshine Creche",
  child: "Lerato",
  amountCents: 125_050,
  paidCents: 50_000,
  dueDate: "2026-10-23",
  reference: "THK7Q2M9XA",
  link,
};
// As long as each field can be: names hit their limits, the largest amount a schedule allows.
const worst = {
  ...fee,
  business: "Ithemba Lethu Early Childhood Development Centre and Aftercare Services Mamelodi East Ext 5",
  child: "Nomvula-Thandiwe Mahlangu-Mokoena Ndlovu",
  amountCents: 10_000_000,
  paidCents: 9_999_999,
};

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

  describe.each(LANGUAGES)("%s fee messages", (lang) => {
    it.each(FEE_TEMPLATES)("%s names the child, amount, due date and reference, has the one link and the PIN warning", (key) => {
      const body = renderTemplate(lang, key, fee);
      expect(body).toContain("Lerato");
      expect(body).toContain("Sunshine Creche");
      expect(body).toContain(key === "balance_request" ? "R500.00" : "R1 250.50");
      expect(body).toContain("THK7Q2M9XA");
      expect(body).toContain("PIN");
      expect(body.match(/https?:\/\//g)).toEqual(["https://"]);
      expect(body).toContain(link);
      if (key !== "balance_request") expect(body).toContain("23/10/2026");
    });

    it.each(FEE_TEMPLATES)("%s without a payment page has no link at all, only the reference", (key) => {
      const body = renderTemplate(lang, key, { ...fee, link: null });
      expect(body).not.toMatch(/https?:\/\/|www\./i);
      expect(body).toContain("THK7Q2M9XA");
    });

    it.each(FEE_TEMPLATES)("%s is plain GSM text: nothing to fold, two SMS parts at most", (key) => {
      const body = renderTemplate(lang, key, fee);
      expect(toGsm(body)).toBe(body);
      expect(smsParts(body)).toBeLessThanOrEqual(2);
    });

    it.each(FEE_TEMPLATES)("%s fits the Clickatell part limit even with the longest names and amounts", (key) => {
      expect(smsParts(toGsm(renderTemplate(lang, key, worst)))).toBeLessThanOrEqual(MAX_SMS_PARTS);
    });

    it.each(FEE_TEMPLATES)("%s can't be turned into a link or address by a business or child name", (key) => {
      const body = renderTemplate(lang, key, {
        ...fee,
        business: "Pay at www.evil.example/x or https://evil.example",
        child: "Lerato.co.za me@evil.example",
      });
      expect(body).not.toMatch(/www\.|evil\.example|me@/i);
      expect(body.match(/https?:\/\//g)).toEqual(["https://"]);
      expect(body).toContain(link);
    });

    it("never mentions late fees or penalties", () => {
      for (const key of FEE_TEMPLATES) expect(renderTemplate(lang, key, fee)).not.toMatch(/late fee|penalt|interest/i);
    });
  });

  describe.each(LANGUAGES)("%s invite message", (lang) => {
    const inviteLink = `https://mythusa.vercel.app/join/${"Ab3_-".repeat(8)}xyz` as InviteLink;
    const invite = { business: "Sunshine Creche", child: "Lerato", link: inviteLink, expiresOn: "2026-11-02" };

    it("names the business and child, has the one link, the expiry and the PIN warning", () => {
      const body = renderTemplate(lang, "parent_invite", invite);
      expect(body).toContain("Sunshine Creche");
      expect(body).toContain("Lerato");
      expect(body).toContain("02/11/2026");
      expect(body).toContain("PIN");
      expect(body.match(/https?:\/\//g)).toEqual(["https://"]);
      expect(body).toContain(inviteLink);
    });

    it("is plain GSM text, and fits the part limit even with the longest names", () => {
      const body = renderTemplate(lang, "parent_invite", invite);
      expect(toGsm(body)).toBe(body);
      expect(smsParts(body)).toBeLessThanOrEqual(2);
      expect(smsParts(toGsm(renderTemplate(lang, "parent_invite", { ...invite, business: worst.business, child: worst.child })))).toBeLessThanOrEqual(
        MAX_SMS_PARTS,
      );
    });

    it("can't be turned into a link or address by a business or child name", () => {
      const body = renderTemplate(lang, "parent_invite", {
        ...invite,
        business: "Pay at www.evil.example/x or https://evil.example",
        child: "Lerato.co.za me@evil.example",
      });
      expect(body).not.toMatch(/www\.|evil\.example|me@/i);
      expect(body.match(/https?:\/\//g)).toEqual(["https://"]);
    });

    it("never mentions an amount, late fees or penalties", () => {
      expect(renderTemplate(lang, "parent_invite", invite)).not.toMatch(/R\d|late fee|penalt|interest/i);
    });
  });

  it("keeps ordinary names as they are", () => {
    expect(plainName("Sunshine Crèche & Aftercare (Pty) Ltd")).toBe("Sunshine Crèche & Aftercare (Pty) Ltd");
    expect(plainName("Ma-Thandi's Kids, No 2")).toBe("Ma-Thandi's Kids, No 2");
    expect(plainName("St. Mary's")).toBe("St Mary's");
  });

  it("formats amounts and dates for SMS without signs or special spaces", () => {
    expect(smsRand(125_050)).toBe("R1 250.50");
    expect(smsRand(30_000)).toBe("R300.00");
    expect(smsRand(5)).toBe("R0.05");
    expect(smsRand(10_000_000)).toBe("R100 000.00");
    expect(() => smsRand(1.5)).toThrow();
    expect(() => smsRand(-100)).toThrow();
    expect(smsDate("2026-10-03")).toBe("03/10/2026");
  });
});
