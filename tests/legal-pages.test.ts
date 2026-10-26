// /terms and /privacy as HTML: the prototype warning, the promises they must keep making, and the links to
// them from footers and consent tick boxes.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", "postgresql://placeholder:placeholder@localhost:5432/placeholder");
vi.stubEnv("CONTACT_EMAIL", "privacy@example.com");

const { default: TermsPage } = await import("@/app/terms/page");
const { default: PrivacyPage } = await import("@/app/privacy/page");
const { ConsentLinks, LegalLinks } = await import("@/components/legal-links");
const { contactEmail, PROTOTYPE_NOTICE } = await import("@/lib/legal");

const render = (component: React.FunctionComponent) => renderToStaticMarkup(createElement(component));
// Text only, with entities and spacing tidied, so assertions read like the page does.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe.each([
  ["terms", TermsPage],
  ["privacy", PrivacyPage],
] as const)("/%s", (_name, page) => {
  it("is marked as a prototype, not legal advice", () => {
    expect(PROTOTYPE_NOTICE).toBe("Hackathon prototype. Not legal advice. To be reviewed before launch.");
    expect(text(render(page))).toContain(PROTOTYPE_NOTICE);
  });

  it("gives the contact email and links to the other page", () => {
    const html = render(page);
    expect(html).toContain('href="mailto:privacy@example.com"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});

describe("/privacy", () => {
  const page = text(render(PrivacyPage));

  it("names the business as responsible party and Thusa as its operator", () => {
    expect(page).toMatch(/responsible party/);
    expect(page).toMatch(/Thusa is its operator/);
  });

  it("lists what is collected, and that bank details and ID numbers never are", () => {
    for (const item of ["your name and cellphone number", "your child's first name", "your payment schedule", "your payment history"]) {
      expect(page).toContain(item);
    }
    expect(page).toContain("We never collect bank details or ID numbers.");
  });

  it("names who it's shared with, and limits the AI provider to totals and first names", () => {
    expect(page).toContain("Stitch, the payment provider");
    expect(page).toMatch(/SMS and WhatsApp providers/);
    expect(page).toMatch(/only totals, counts and parents' first names/);
    expect(page).toMatch(/Never phone numbers, surnames, children's names or payment references/);
  });

  it("says where it's stored, how long it's kept, and what people can ask for", () => {
    expect(page).toMatch(/Frankfurt, Germany/);
    expect(page).toMatch(/How long we keep it/);
    expect(page).toMatch(/to see the information we hold about you/);
    expect(page).toMatch(/to correct it/);
    expect(page).toMatch(/to delete it/);
    expect(page).toMatch(/Information Regulator/);
  });
});

describe("/terms", () => {
  const page = text(render(TermsPage));

  it("makes the money promises", () => {
    expect(page).toContain("Thusa never holds your money");
    expect(page).toContain("Parents never pay Thusa fees");
    expect(page).toContain("No late fees or penalties");
    expect(page).toContain("The business sets the amounts");
    expect(page).toMatch(/Parents can't change an amount in Thusa/);
  });

  it("says payment history is a record, not proof of income or creditworthiness", () => {
    expect(page).toContain("Payment history is a record, not proof");
    expect(page).toMatch(/isn't proof of income/);
    expect(page).toMatch(/creditworthy/);
  });
});

describe("links", () => {
  it("the footer links go to both pages", () => {
    const html = renderToStaticMarkup(createElement(LegalLinks));
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("consent links open both pages in a new tab, so a half-filled form isn't lost", () => {
    const html = renderToStaticMarkup(createElement(ConsentLinks));
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("(opens in a new tab)");
  });
});

describe("contactEmail", () => {
  it("only shows a valid address", () => {
    expect(contactEmail(" privacy@example.com ")).toBe("privacy@example.com");
    expect(contactEmail("")).toBeNull();
    expect(contactEmail("   ")).toBeNull();
    expect(contactEmail("not an email")).toBeNull();
    expect(contactEmail("javascript:alert(1)")).toBeNull();
  });
});
