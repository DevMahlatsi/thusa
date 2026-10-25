// The "This week in plain words" panel as HTML: the right label for AI and rule-based text, AI text only
// ever as plain text, and Refresh only when allowed.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { PlainWords, PlainWordsSkeleton } = await import("@/components/dashboard/plain-words");

const render = (props: Partial<Parameters<typeof PlainWords>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PlainWords, {
      period: "19–25 Oct 2026",
      language: "en",
      summary: { source: "fallback", facts: ["This week you received R350 of the R700 due."], ideas: ["You could thank them."] },
      isSample: false,
      canRefresh: false,
      ...props,
    }),
  );

describe("PlainWords", () => {
  it("labels the rule-based sentences as worked out from the records", () => {
    const html = render();
    expect(html).toContain("This week you received R350 of the R700 due.");
    expect(html).toContain("<li>You could thank them.</li>");
    expect(html).toContain("Worked out from your payment records.");
    expect(html).not.toContain("AI-generated");
  });

  it("labels AI text as AI-generated, and shows it as plain text only", () => {
    const html = render({ summary: { source: "ai", text: "Thandi paid. <b>Bold</b> <script>alert(1)</script>" }, language: "zu" });
    expect(html).toContain("AI-generated from your payment records. Check before acting.");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('lang="zu"');
  });

  it("shows the AI's headline on a line of its own", () => {
    const html = render({ summary: { source: "ai", text: "Half of this week's fees are in.\nYou could thank Sipho." } });
    expect(html).toContain('<p class="plain-words-headline">Half of this week&#x27;s fees are in.</p><p>You could thank Sipho.</p>');
  });

  it("offers Refresh only when allowed", () => {
    expect(render()).not.toContain("Refresh");
    expect(render({ canRefresh: true })).toContain(">Refresh</button>");
  });

  it("has a skeleton with the week and the language links while it loads", () => {
    const html = renderToStaticMarkup(createElement(PlainWordsSkeleton, { period: "19–25 Oct 2026", language: "st", isSample: true }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("19–25 Oct 2026");
    expect(html).toContain('href="/dashboard?lang=st"');
    expect(html).toContain("Sample");
  });
});
