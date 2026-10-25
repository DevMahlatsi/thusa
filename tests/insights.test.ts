// "This week in plain words", rule-based (src/lib/insights/): the period, totals, badges, behindCents,
// suggestions, the top parents and the fixed sentences in all four languages. See docs/AI.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectSchedulesBetween, type CollectionRow } from "@/lib/dashboard";
import {
  buildInsights,
  firstName,
  historyStart,
  insightPeriod,
  pickLanguage,
  type InsightPayer,
  type Insights,
} from "@/lib/insights";
import { plainWords, sentences } from "@/lib/insights/sentences";
import { proseRand } from "@/lib/insights/sentences/format";
import type { SentenceSet } from "@/lib/insights/sentences/types";
import { SAMPLE_TODAY, sampleCollections, samplePayers } from "@/lib/sample-dashboard";
import { addDays } from "@/lib/schedule-dates";
import { LANGUAGES } from "@/messaging/templates/types";

// Sunday 25 October 2026.
const TODAY = "2026-10-25";
const plain = (text: string) => text.replace(/ /g, " ");

let seq = 0;
const row = (payerId: string, dueDate: string, over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: `c${++seq}`,
  payerId,
  parentName: "Thandi Mokoena",
  childName: "Lerato",
  reference: "THK7Q2M9XA",
  rhythm: "WEEKLY",
  dueDate,
  amountCents: 35_000,
  paidCents: 35_000,
  status: "PAID",
  paidOnTime: true,
  paidOn: dueDate,
  requested: true,
  paymentUrl: null,
  balanceRequested: false,
  remindersSent: 0,
  remindedToday: false,
  ...over,
});
const unpaid = (payerId: string, dueDate: string, over: Partial<CollectionRow> = {}) =>
  row(payerId, dueDate, { paidCents: 0, status: "PENDING", paidOnTime: false, paidOn: null, ...over });
const late = (payerId: string, dueDate: string) => row(payerId, dueDate, { paidOnTime: false, paidOn: addDays(dueDate, 3) });
const unsent = (payerId: string, dueDate: string) => unpaid(payerId, dueDate, { requested: false, reference: "" });

const payer = (id: string, over: Partial<InsightPayer> = {}): InsightPayer => ({
  id,
  firstName: id,
  rhythm: "WEEKLY",
  feeCents: 35_000,
  ...over,
});

/** Weekly fees on these days before TODAY, paid on time. */
const onTimeWeeks = (payerId: string, ...daysAgo: number[]) => daysAgo.map((d) => row(payerId, addDays(TODAY, -d)));

const insightFor = (p: InsightPayer, rows: CollectionRow[], today = TODAY) =>
  buildInsights({ rows, payers: [p], today }).parents[0]!;

describe("insightPeriod", () => {
  it("is the last 7 days up to and including today", () => {
    expect(insightPeriod(TODAY)).toEqual({ start: "2026-10-19", end: "2026-10-25", label: "19–25 Oct 2026" });
  });

  it("crosses a month end", () => {
    expect(insightPeriod("2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-01", label: "26 Oct – 1 Nov 2026" });
  });

  it("crosses a year end", () => {
    expect(insightPeriod("2027-01-03").label).toBe("28 Dec 2026 – 3 Jan 2027");
  });
});

describe("historyStart", () => {
  it("goes back four months to the first", () => {
    expect(historyStart(TODAY)).toBe("2026-06-01");
    expect(historyStart("2026-02-10")).toBe("2025-10-01");
  });
});

describe("firstName", () => {
  it("takes the first word, skipping titles", () => {
    expect(firstName("Thandi Mokoena")).toBe("Thandi");
    expect(firstName("  Johan   van Wyk ")).toBe("Johan");
    expect(firstName("Mrs Thandi Mokoena")).toBe("Thandi");
    expect(firstName("Dr. Ayesha Khan")).toBe("Ayesha");
    expect(firstName("mme Palesa Nkosi")).toBe("Palesa");
    expect(firstName("Gogo Nomsa Dlamini")).toBe("Nomsa");
    expect(firstName("Lindiwe")).toBe("Lindiwe");
  });

  it("keeps a title that only has a surname after it", () => {
    expect(firstName("Mr Dlamini")).toBe("Mr Dlamini");
    expect(firstName("Gogo")).toBe("Gogo");
  });
});

describe("totals and on-time rate", () => {
  it("counts fees due in the period across a month end (1 Nov), sent or not", () => {
    const today = "2026-11-01";
    const insights = buildInsights({
      rows: [
        row("a", "2026-10-25"), // the day before the period
        row("a", "2026-10-26"),
        row("b", "2026-10-30", { amountCents: 70_000, paidCents: 35_000, status: "PARTIAL", paidOnTime: false, paidOn: null }),
        unsent("c", "2026-11-01"),
        unpaid("a", "2026-11-02"), // after today
      ].map((r) => (r.payerId === "c" ? { ...r, amountCents: 145_000 } : r)),
      payers: [],
      today,
    });
    expect(insights.period.label).toBe("26 Oct – 1 Nov 2026");
    expect(insights.totals).toEqual({ expectedCents: 250_000, receivedCents: 70_000, outstandingCents: 180_000 });
    // The dashboard's maths: an unsent fee is not paid on time.
    expect(insights.onTimeRate).toBeCloseTo(1 / 3);
  });

  it("has no on-time rate when nothing in the period was sent", () => {
    const insights = buildInsights({ rows: [unsent("a", "2026-10-23"), row("a", "2026-10-16")], payers: [], today: TODAY });
    expect(insights.onTimeRate).toBeNull();
    expect(insights.totals.expectedCents).toBe(35_000);
  });

  it("projects due dates on both sides of a month end", () => {
    const payers = [
      { id: "w", parentName: "W", childName: "C", schedule: { amountCents: 35_000, rhythm: "WEEKLY" as const, payday: 7, startsOn: "2026-09-01" } },
      { id: "m", parentName: "M", childName: "C", schedule: { amountCents: 145_000, rhythm: "MONTHLY" as const, payday: 31, startsOn: "2026-09-01" } },
    ];
    const rows = projectSchedulesBetween(payers, "2026-10-26", "2026-11-01");
    expect(rows.map((r) => `${r.payerId} ${r.dueDate}`).sort()).toEqual(["m 2026-10-31", "w 2026-11-01"]);
  });

  it("counts an archived parent's fees in the totals but gives them no insight", () => {
    const insights = buildInsights({ rows: [unpaid("gone", "2026-10-20"), unpaid("gone", "2026-10-10")], payers: [], today: TODAY });
    expect(insights.totals.expectedCents).toBe(35_000);
    expect(insights.parents).toEqual([]);
    expect(insights.behind).toEqual({ count: 0, cents: 0 });
  });
});

describe("badges and behindCents", () => {
  it("NEEDS_SUPPORT: two recent fees not fully paid", () => {
    const p = insightFor(payer("p"), [...onTimeWeeks("p", 25, 18), unpaid("p", "2026-10-18"), unpaid("p", "2026-10-21")]);
    expect(p).toMatchObject({ badge: "NEEDS_SUPPORT", behindCents: 70_000 });
  });

  it("NEEDS_SUPPORT: one fee part-paid 7 or more days after its due date", () => {
    const p = insightFor(payer("p"), [
      ...onTimeWeeks("p", 28, 21, 14),
      row("p", "2026-10-18", { paidCents: 10_000, status: "PARTIAL", paidOnTime: false, paidOn: null }),
    ]);
    expect(p).toMatchObject({ badge: "NEEDS_SUPPORT", behindCents: 25_000 });
  });

  it("one fee unpaid for 6 days is not yet NEEDS_SUPPORT", () => {
    const p = insightFor(payer("p"), [...onTimeWeeks("p", 27, 20, 13), unpaid("p", "2026-10-19")]);
    expect(p).toMatchObject({ badge: "ON_TRACK", behindCents: 35_000 });
  });

  it("NEW: fewer than 3 sent fees so far", () => {
    expect(insightFor(payer("p"), onTimeWeeks("p", 14, 7)).badge).toBe("NEW");
  });

  it("NEEDS_SUPPORT comes before NEW", () => {
    expect(insightFor(payer("p"), [unpaid("p", "2026-10-17")]).badge).toBe("NEEDS_SUPPORT");
  });

  it("RELIABLE: the last 4 fees were paid on time, whatever came before", () => {
    const p = insightFor(payer("p"), [late("p", "2026-09-20"), ...onTimeWeeks("p", 28, 21, 14, 7)]);
    expect(p).toMatchObject({ badge: "RELIABLE", behindCents: 0 });
  });

  it("RELIABLE: 3 fees on time when that's all there is", () => {
    expect(insightFor(payer("p"), onTimeWeeks("p", 21, 14, 7)).badge).toBe("RELIABLE");
  });

  it("RELIABLE for a monthly parent looks back past the five-week window", () => {
    const monthly = (d: string) => row("p", d, { rhythm: "MONTHLY", amountCents: 145_000, paidCents: 145_000 });
    const rows = ["2026-06-25", "2026-07-25", "2026-08-25", "2026-09-25"].map(monthly);
    expect(insightFor(payer("p", { rhythm: "MONTHLY", feeCents: 145_000 }), rows).badge).toBe("RELIABLE");
  });

  it("ON_TRACK: paid, but not always on time", () => {
    expect(insightFor(payer("p"), [...onTimeWeeks("p", 28, 21, 7), late("p", "2026-10-11")]).badge).toBe("ON_TRACK");
  });

  it("ignores a fee due today: it can still be paid today", () => {
    const p = insightFor(payer("p"), [...onTimeWeeks("p", 28, 21, 14, 7), unpaid("p", TODAY)]);
    expect(p).toMatchObject({ badge: "RELIABLE", behindCents: 0 });
  });

  it("ignores fees that were never sent", () => {
    const p = insightFor(payer("p"), [...onTimeWeeks("p", 28, 21, 14), unsent("p", "2026-10-15"), unsent("p", "2026-10-22")]);
    expect(p).toMatchObject({ badge: "RELIABLE", behindCents: 0 });
    expect(insightFor(payer("q"), [unsent("q", "2026-10-01"), unsent("q", "2026-10-08")])).toMatchObject({
      badge: "NEW",
      behindCents: 0,
    });
  });

  it("counts only the last 35 days towards behindCents", () => {
    const p = insightFor(payer("p"), [unpaid("p", "2026-09-10"), ...onTimeWeeks("p", 21, 14, 7)]);
    expect(p).toMatchObject({ badge: "ON_TRACK", behindCents: 0 });
  });
});

describe("suggestions", () => {
  it("OFFER_ARRANGEMENT when behind by more than one whole fee", () => {
    const insights = buildInsights({ rows: [unpaid("p", "2026-10-14"), unpaid("p", "2026-10-21")], payers: [payer("p")], today: TODAY });
    expect(insights.suggestions).toEqual([{ type: "OFFER_ARRANGEMENT", payerId: "p", firstName: "p", behindCents: 70_000 }]);
  });

  it("SWITCH_TO_WEEKLY for NEEDS_SUPPORT on a monthly or fortnightly schedule", () => {
    const monthly = payer("m", { rhythm: "MONTHLY", feeCents: 145_000 });
    const fortnightly = payer("f", { rhythm: "FORTNIGHTLY", feeCents: 70_000 });
    const insights = buildInsights({
      rows: [
        unpaid("m", "2026-10-15", { rhythm: "MONTHLY", amountCents: 145_000 }),
        row("f", "2026-10-09", { rhythm: "FORTNIGHTLY", amountCents: 70_000, paidCents: 35_000, status: "PARTIAL", paidOnTime: false, paidOn: null }),
      ],
      payers: [monthly, fortnightly],
      today: TODAY,
    });
    expect(insights.suggestions).toEqual([
      { type: "SWITCH_TO_WEEKLY", payerId: "m", firstName: "m", rhythm: "MONTHLY" },
      { type: "SWITCH_TO_WEEKLY", payerId: "f", firstName: "f", rhythm: "FORTNIGHTLY" },
    ]);
  });

  it("nothing for a weekly parent one fee behind", () => {
    const insights = buildInsights({ rows: [...onTimeWeeks("p", 28, 21), unpaid("p", "2026-10-14")], payers: [payer("p")], today: TODAY });
    expect(insights.parents[0]!.badge).toBe("NEEDS_SUPPORT");
    expect(insights.suggestions).toEqual([]);
  });

  it("REWARD_UPFRONT counts parents who paid a fee before its due date, once each", () => {
    const early = (payerId: string, dueDate: string, days: number) => row(payerId, dueDate, { paidOn: addDays(dueDate, -days) });
    const insights = buildInsights({
      rows: [
        early("a", "2026-10-09", 2),
        early("a", "2026-10-16", 1),
        early("b", "2026-10-30", 6), // a fee still to come, already paid
        row("c", "2026-10-23"), // on the due date: on time, not early
        early("d", "2026-09-15", 3), // more than 35 days ago
      ],
      payers: ["a", "b", "c", "d"].map((id) => payer(id)),
      today: TODAY,
    });
    expect(insights.suggestions).toEqual([{ type: "REWARD_UPFRONT", count: 2 }]);
  });

  it("only for the top 10 parents; behind still counts everyone", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `m${String(i).padStart(2, "0")}`);
    const insights = buildInsights({
      rows: ids.map((id) => unpaid(id, "2026-10-15", { rhythm: "MONTHLY", amountCents: 145_000 })),
      payers: ids.map((id) => payer(id, { rhythm: "MONTHLY", feeCents: 145_000 })),
      today: TODAY,
    });
    expect(insights.parents).toHaveLength(10);
    expect(insights.suggestions).toHaveLength(10);
    expect(insights.suggestions.map((s) => s.type === "SWITCH_TO_WEEKLY" && s.firstName)).not.toContain("m10");
    expect(insights.behind).toEqual({ count: 11, cents: 11 * 145_000 });
  });
});

describe("top parents", () => {
  it("needs support first (most behind first), then anyone behind, reliable, on track, new", () => {
    const rows: CollectionRow[] = [
      unpaid("small", "2026-10-14"),
      unpaid("small", "2026-10-21"),
      unpaid("big", "2026-10-15", { rhythm: "MONTHLY", amountCents: 145_000 }),
      ...onTimeWeeks("behind", 27, 20, 13),
      unpaid("behind", "2026-10-22"),
      ...["Zanele", "Anele", "Mpho"].flatMap((id) => onTimeWeeks(id, 21, 14, 7)),
      ...["Yusuf", "Bongi"].flatMap((id) => [...onTimeWeeks(id, 21, 14), late(id, addDays(TODAY, -7))]),
      ...["Neo", "Ayanda"].flatMap((id) => onTimeWeeks(id, 7)),
    ];
    const ids = ["small", "big", "behind", "Zanele", "Anele", "Mpho", "Yusuf", "Bongi", "Neo", "Ayanda", "Karabo", "Lerato"];
    const insights = buildInsights({ rows, payers: ids.map((id) => payer(id)), today: TODAY });
    expect(insights.parents.map((p) => p.firstName)).toEqual([
      "big",
      "small",
      "behind",
      "Anele",
      "Mpho",
      "Zanele",
      "Bongi",
      "Yusuf",
      "Ayanda",
      "Karabo",
    ]);
    expect(insights.reliable).toEqual(["Anele", "Mpho", "Zanele"]);
    expect(insights.behind).toEqual({ count: 3, cents: 145_000 + 70_000 + 35_000 });
  });

  it("gives the insights only first names, rhythms, badges and amounts", () => {
    const insights = buildInsights({ rows: onTimeWeeks("p", 21, 14, 7), payers: [payer("p", { firstName: "Thandi" })], today: TODAY });
    const text = JSON.stringify(insights);
    for (const leak of ["Mokoena", "Lerato", "THK7Q2M9XA"]) expect(text).not.toContain(leak);
  });
});

describe("the sample preview", () => {
  it("works over the sample rows", () => {
    const insights = buildInsights({ rows: sampleCollections(), payers: samplePayers(), today: SAMPLE_TODAY });
    expect(insights.period.label).toBe("17–23 Oct 2026");
    expect(insights.suggestions).toContainEqual({ type: "SWITCH_TO_WEEKLY", payerId: "sample-F", firstName: "Parent F", rhythm: "MONTHLY" });
    expect(insights.suggestions).toContainEqual({ type: "REWARD_UPFRONT", count: 1 });
    for (const language of LANGUAGES) expect(plainWords(insights, language).facts.length).toBeGreaterThan(0);
  });
});

describe("proseRand", () => {
  it("writes rand the way docs/AI.md does", () => {
    expect(plain(proseRand(420_000))).toBe("R4 200");
    expect(plain(proseRand(420_050))).toBe("R4 200.50");
    expect(proseRand(35_000)).toBe("R350");
    expect(proseRand(0)).toBe("R0");
    expect(plain(proseRand(123_456_789))).toBe("R1 234 567.89");
    expect(() => proseRand(-1)).toThrow();
    expect(() => proseRand(1.5)).toThrow();
  });
});

describe("pickLanguage", () => {
  it("takes one of the four languages, else the business's", () => {
    expect(pickLanguage("zu", "en")).toBe("zu");
    expect(pickLanguage(["st", "en"], "en")).toBe("st");
    expect(pickLanguage("fr", "tn")).toBe("tn");
    expect(pickLanguage(undefined, "zu")).toBe("zu");
  });
});

// Every sentence, singular and plural, with the names and amounts it must carry.
const CASES: { [K in keyof SentenceSet]: { params: Parameters<SentenceSet[K]>[0]; has: string[] }[] } = {
  received: [{ params: { receivedCents: 420_000, expectedCents: 510_000 }, has: ["R4 200", "R5 100"] }],
  nothingDue: [{ params: undefined, has: [] }],
  allPaid: [{ params: undefined, has: [] }],
  outstanding: [{ params: { outstandingCents: 90_000 }, has: ["R900"] }],
  onTime: [{ params: { percent: 82 }, has: ["82%"] }],
  behind: [
    { params: { count: 1, cents: 35_000, weeks: 5 }, has: ["R350", "5"] },
    { params: { count: 3, cents: 140_000, weeks: 5 }, has: ["3", "R1 400", "5"] },
  ],
  reliable: [
    { params: { names: ["Bongani"], more: 0 }, has: ["Bongani"] },
    { params: { names: ["Bongani", "Sipho"], more: 0 }, has: ["Bongani", "Sipho"] },
    { params: { names: ["Bongani", "Sipho", "Lindiwe"], more: 0 }, has: ["Bongani", "Sipho", "Lindiwe"] },
    { params: { names: ["Bongani", "Sipho", "Lindiwe"], more: 1 }, has: ["Bongani", "Sipho", "Lindiwe"] },
    { params: { names: ["Bongani", "Sipho", "Lindiwe"], more: 4 }, has: ["Bongani", "Sipho", "Lindiwe", "4"] },
  ],
  offerArrangement: [{ params: { name: "Thandi", behindCents: 140_050 }, has: ["Thandi", "R1 400.50"] }],
  switchToWeekly: [
    { params: { name: "Palesa", rhythm: "MONTHLY" }, has: ["Palesa"] },
    { params: { name: "Palesa", rhythm: "FORTNIGHTLY" }, has: ["Palesa"] },
  ],
  rewardUpfront: [
    { params: { count: 1 }, has: [] },
    { params: { count: 6 }, has: ["6"] },
  ],
};

describe("sentences", () => {
  for (const language of LANGUAGES) {
    it(`has every sentence in ${language}, with its names and amounts`, () => {
      const set = sentences[language];
      for (const [key, cases] of Object.entries(CASES) as [keyof SentenceSet, { params: never; has: string[] }[]][]) {
        const seen = new Set<string>();
        for (const { params, has } of cases) {
          const text = (set[key] as (p: never) => string)(params);
          const label = `${language}.${key}: ${text}`;
          expect(text.trim(), label).toBe(text);
          expect(text, label).toMatch(/^\p{Lu}|^R?\d/u);
          expect(text, label).toMatch(/\.$/);
          expect(text, label).not.toMatch(/undefined|NaN|null|\s{2}|https?:|[*#_`<>[\]]/);
          for (const part of has) expect(plain(text), label).toContain(part);
          seen.add(text);
        }
        // Singular and plural, monthly and fortnightly, read differently.
        expect(seen.size, `${language}.${key}`).toBe(cases.length);
      }
    });
  }

  it("never guesses a parent's gender in English", () => {
    const all = Object.entries(CASES).flatMap(([key, cases]) =>
      cases.map(({ params }) => (sentences.en[key as keyof SentenceSet] as (p: never) => string)(params as never)),
    );
    for (const text of all) expect(text).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
  });
});

describe("plainWords", () => {
  const week: Insights = {
    period: { start: "2026-10-19", end: TODAY, label: "19–25 Oct 2026" },
    totals: { expectedCents: 510_000, receivedCents: 420_000, outstandingCents: 90_000 },
    onTimeRate: 0.82,
    parents: [],
    suggestions: [
      { type: "OFFER_ARRANGEMENT", payerId: "t", firstName: "Thandi", behindCents: 140_000 },
      { type: "SWITCH_TO_WEEKLY", payerId: "p", firstName: "Palesa", rhythm: "FORTNIGHTLY" },
      { type: "REWARD_UPFRONT", count: 6 },
    ],
    behind: { count: 3, cents: 245_000 },
    reliable: ["Bongani", "Lindiwe", "Sipho", "Tshepo"],
  };

  it("reads the week in English", () => {
    const { facts, ideas } = plainWords(week, "en");
    expect(facts.map(plain)).toEqual([
      "This week you received R4 200 of the R5 100 due.",
      "R900 is still outstanding.",
      "82% of this week's fees were paid on time.",
      "3 parents still have R2 450 to pay between them from the last 5 weeks.",
      "Bongani, Lindiwe, Sipho and 1 other have paid their last few fees on time.",
    ]);
    expect(ideas.map(plain)).toEqual([
      "Thandi has R1 400 still to pay. You could agree a payment plan with Thandi.",
      "You could offer Palesa weekly payments instead of fortnightly ones: smaller amounts can be easier to keep up with.",
      "6 parents paid a fee before it was due. You could thank them.",
    ]);
  });

  it("says the same things in every language", () => {
    for (const language of LANGUAGES) {
      const { facts, ideas } = plainWords(week, language);
      expect(facts, language).toHaveLength(5);
      expect(ideas, language).toHaveLength(3);
      const text = plain([...facts, ...ideas].join(" "));
      for (const part of ["R4 200", "R5 100", "R900", "82%", "R2 450", "R1 400", "Thandi", "Palesa", "Bongani"]) {
        expect(text, language).toContain(part);
      }
    }
  });

  it("says when nothing was due, and when everything is paid", () => {
    const quiet = { ...week, totals: { expectedCents: 0, receivedCents: 0, outstandingCents: 0 }, onTimeRate: null };
    expect(plainWords({ ...quiet, behind: { count: 0, cents: 0 }, reliable: [], suggestions: [] }, "en")).toEqual({
      facts: ["No fees were due this week."],
      ideas: [],
    });
    const paid = { ...week, totals: { expectedCents: 70_000, receivedCents: 70_000, outstandingCents: 0 } };
    expect(plainWords(paid, "en").facts[1]).toBe("Everything due this week has been paid.");
  });

  it("names at most 3 parents' suggestions, plus the thank-you", () => {
    const many = ["A", "B", "C", "D", "E"].map((n) => ({ type: "SWITCH_TO_WEEKLY" as const, payerId: n, firstName: n, rhythm: "MONTHLY" as const }));
    const { ideas } = plainWords({ ...week, suggestions: [...many, { type: "REWARD_UPFRONT", count: 2 }] }, "en");
    expect(ideas).toHaveLength(4);
    expect(ideas.at(-1)).toBe("2 parents paid a fee before it was due. You could thank them.");
  });
});

describe("boundaries", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

  it("insights use the message templates' language list only, and messages never use insights", () => {
    for (const file of files("src/lib/insights")) {
      const imports = [...readFileSync(file, "utf8").matchAll(/from "(@\/messaging[^"]*)"/g)].map((m) => m[1]);
      for (const path of imports) expect(path, file).toBe("@/messaging/templates/types");
    }
    for (const file of [...files("src/messaging"), "src/lib/parent-messages.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/insights/);
    }
  });
});
