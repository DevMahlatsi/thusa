// The parent's invite page form as HTML: it says what happens before asking anything, never asks for a phone
// number or an amount, and puts the consent sentence and the legal links beside the tick box. Also the owner's
// note above the message to send.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteSendNote } from "@/components/invite-view";
import { JoinForm } from "@/components/join-form";
import { consentText } from "@/lib/invites";

const html = renderToStaticMarkup(
  createElement(JoinForm, {
    token: "A".repeat(43),
    businessName: "Kopano Crèche",
    phoneMasked: "••••4567",
    options: [
      { rhythm: "MONTHLY", amountCents: 120_000 },
      { rhythm: "FORTNIGHTLY", amountCents: 55_385 },
      { rhythm: "WEEKLY", amountCents: 27_692 },
    ],
    defaultLanguage: "en",
    consentText: consentText("Kopano Crèche"),
  }),
);
// React escapes apostrophes and splits text around expressions; compare on plain text.
const text = html
  .replace(/<!-- -->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'")
  .replace(/\s+/g, " ");

describe("JoinForm", () => {
  it("says what happens, what's kept and how to stop, before the first field", () => {
    expect(html.indexOf("What happens")).toBeLessThan(html.indexOf('id="parentName"'));
    expect(text).toContain("Kopano Crèche checks your details and approves them. Nothing is sent to you before that.");
    expect(text).toContain("payment request by SMS or WhatsApp");
    expect(text).toContain("Thusa keeps your name, cellphone number, payday, language, your payments and that you agreed");
    expect(text).toContain("Thusa never asks for your PIN or banking password");
    expect(text).toContain("You can stop at any time: ask Kopano Crèche to remove you, and the messages stop.");
  });

  it("asks for consent in the agreed words, with the terms and privacy notice beside it", () => {
    expect(text).toContain("I agree to receive payment requests and reminders from Kopano Crèche through Thusa.");
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("shows the amounts and the number's last digits, but has no field for either", () => {
    expect(text).toContain("R 276.92 each week");
    expect(text).toContain("ending 4567");
    expect(html).not.toMatch(/type="tel"|id="phone"|id="amount"|inputMode="decimal"/i);
  });
});

describe("InviteSendNote", () => {
  const link = `https://mythusa.vercel.app/join/${"A".repeat(43)}`;
  const note = (whatsAppOn: boolean) => renderToStaticMarkup(createElement(InviteSendNote, { link, whatsAppOn }));

  it("says Thusa would send the link itself with the WhatsApp API, while it's off", () => {
    expect(note(false)).toContain("With the WhatsApp Business API switched on, Thusa would send this link to the parent for you.");
    expect(note(true)).not.toContain("WhatsApp Business API");
  });

  it("opens the parent's real page in a new tab, and warns that filling it in counts", () => {
    for (const html of [note(false), note(true)]) {
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain('target="_blank"');
      expect(html).toContain("See what the parent sees");
      expect(html).toContain("it counts as their answers");
    }
  });
});
