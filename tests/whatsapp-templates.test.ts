// The WhatsApp templates: Meta's formatting rules (so they get approved), what fills them in, and that the
// text Thusa records is the text Meta sends.
import { describe, expect, it } from "vitest";
import type { FeeParams, PaymentLink } from "@/messaging/templates";
import {
  allWhatsAppTemplateDefinitions,
  renderWhatsApp,
  WHATSAPP_LANGUAGES,
  WHATSAPP_TEMPLATE_KEYS,
  whatsAppBodyTemplate,
  whatsAppTemplateDefinition,
} from "@/messaging/templates/whatsapp";
import { PAYMENT_PAGE_BASE_URL, paymentPageId } from "@/payments/adapter";

const link = "https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa" as PaymentLink;
const fee: FeeParams & { paidCents: number } = {
  business: "Sunshine Crèche",
  child: "Lerato",
  amountCents: 125_050,
  paidCents: 50_000,
  dueDate: "2026-10-23",
  reference: "THK7Q2M9XA",
  link,
};
const cases = WHATSAPP_LANGUAGES.flatMap((lang) => WHATSAPP_TEMPLATE_KEYS.map((key) => [lang, key] as const));

describe("WhatsApp templates follow Meta's rules", () => {
  it.each(cases)("%s %s: numbered variables in order, not at the start or end, never side by side", (lang, key) => {
    const body = whatsAppBodyTemplate(lang, key);
    const numbers = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/^\s*\{\{/);
    expect(body).not.toMatch(/\}\}\W*$/);
    expect(body).not.toMatch(/\}\}\s*\{\{/);
    expect(body).not.toContain("undefined");
    expect(body.length).toBeLessThanOrEqual(1024);
  });

  it.each(cases)("%s %s: utility category, footer and button within Meta's limits, link only via the button", (lang, key) => {
    const d = whatsAppTemplateDefinition(lang, key);
    expect(d.name).toMatch(/^[a-z0-9_]{1,512}$/);
    expect(d.category).toBe("UTILITY");
    const [body, footer, buttons] = d.components;
    expect(body.text).not.toMatch(/https?:\/\/|www\./i);
    expect(body.example.body_text[0]).toHaveLength([...body.text.matchAll(/\{\{\d+\}\}/g)].length);
    expect(footer.text.length).toBeLessThanOrEqual(60);
    expect(footer.text).toContain("PIN");
    const [button] = buttons.buttons;
    expect(button.text.length).toBeLessThanOrEqual(25);
    expect(button.url).toBe(`${PAYMENT_PAGE_BASE_URL}{{1}}`);
    expect(button.example[0]!.startsWith(PAYMENT_PAGE_BASE_URL)).toBe(true);
  });

  it("asks for every fee template in English and isiZulu, with no promotional wording", () => {
    const all = allWhatsAppTemplateDefinitions();
    expect(all.map((d) => `${d.name}:${d.language}`).sort()).toEqual(
      [
        "thusa_balance_request_v1:en",
        "thusa_balance_request_v1:zu",
        "thusa_payment_reminder_v1:en",
        "thusa_payment_reminder_v1:zu",
        "thusa_payment_request_v1:en",
        "thusa_payment_request_v1:zu",
      ].sort(),
    );
    for (const d of all) expect(d.components[0].text).not.toMatch(/offer|discount|don't miss|late fee|penalt/i);
  });
});

describe("renderWhatsApp", () => {
  it.each(cases)("%s %s: the recorded text is Meta's body with the variables filled in, plus footer and button", (lang, key) => {
    const msg = renderWhatsApp(lang, key, fee)!;
    const filled = whatsAppBodyTemplate(lang, key).replace(/\{\{(\d+)\}\}/g, (_, n) => msg.bodyParameters[Number(n) - 1]!);
    const d = whatsAppTemplateDefinition(lang, key);
    expect(msg.text).toBe(`${filled}\n\n${d.components[1].text}\n\n[${d.components[2].buttons[0].text}] ${link}`);
    expect(msg.name).toBe(d.name);
    expect(msg.buttonParameter).toBe("uoJKLysCwhRAHNWAQR4SFa");
  });

  it("fills in names as plain words, amounts and dates as in the SMS", () => {
    const msg = renderWhatsApp("en", "balance_request", { ...fee, business: "Pay at www.evil.example now" })!;
    expect(msg.bodyParameters).toEqual(["Pay at www evil example now", "R500.00", "Lerato", "R1 250.50", "THK7Q2M9XA"]);
    expect(renderWhatsApp("en", "payment_request", fee)!.bodyParameters).toEqual([
      "Sunshine Crèche",
      "Lerato",
      "R1 250.50",
      "23/10/2026",
      "THK7Q2M9XA",
    ]);
    // Meta refuses variables with new lines, tabs or runs of spaces.
    for (const value of renderWhatsApp("en", "payment_request", { ...fee, child: "Le\nra\t   to" })!.bodyParameters) {
      expect(value).not.toMatch(/[\n\t]| {4,}/);
    }
  });

  it("can't carry Sesotho or Setswana, or a fee without a payment page under the button's base URL", () => {
    expect(renderWhatsApp("st", "payment_request", fee)).toBeNull();
    expect(renderWhatsApp("tn", "payment_reminder", fee)).toBeNull();
    expect(renderWhatsApp("en", "payment_request", { ...fee, link: null })).toBeNull();
    expect(renderWhatsApp("en", "payment_request", { ...fee, link: "https://express.stitch.money/DjbyqE" as PaymentLink })).toBeNull();
  });
});

describe("paymentPageId", () => {
  it("takes the id from a Stitch payment page and nothing else", () => {
    expect(paymentPageId(link)).toBe("uoJKLysCwhRAHNWAQR4SFa");
    for (const other of [
      "https://express.stitch.money/pay/",
      "https://express.stitch.money/pay/abc/complete",
      "https://express.stitch.money/pay/abc?x=1",
      "https://express.stitch.money.evil.example/pay/abc",
      "https://stitch.money/pay/abc",
    ]) {
      expect(paymentPageId(other as PaymentLink)).toBeNull();
    }
  });
});
