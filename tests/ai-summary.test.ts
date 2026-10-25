// The AI summary (src/ai/): config, the Responses API client, the allowed input, the output checks and the
// fallback to the rule-based sentences. fetch is stubbed; nothing here reaches the network. See docs/AI.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRequestError, createResponse, MAX_OUTPUT_TOKENS, parseAiConfig, type AiConfig } from "@/ai/client";
import { instructionsFor, MAX_WORDS } from "@/ai/prompt";
import { buildAiInput, checkSummary, summarise, type AiInput } from "@/ai/summary";
import type { CollectionRow } from "@/lib/dashboard";
import { buildInsights, type InsightPayer } from "@/lib/insights";
import { plainWords } from "@/lib/insights/sentences";
import { addDays } from "@/lib/schedule-dates";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const answer = (text: string, extra: Record<string, unknown> = {}) =>
  json({
    id: "resp_1",
    object: "response",
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
    ],
    ...extra,
  });

const KEY = "sk-test-not-a-real-key"; // gitleaks:allow
const ON = { AI_SUMMARY_ENABLED: "true", OPENAI_API_KEY: KEY };
const cfg: AiConfig = { apiKey: KEY, model: "gpt-5.6-luna", effort: "low" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Sunday 25 October 2026.
const TODAY = "2026-10-25";
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
  paymentUrl: "https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa",
  balanceRequested: false,
  remindersSent: 0,
  remindedToday: false,
  ...over,
});
const unpaid = (payerId: string, dueDate: string, over: Partial<CollectionRow> = {}) =>
  row(payerId, dueDate, { paidCents: 0, status: "PENDING", paidOnTime: false, paidOn: null, ...over });
const payer = (id: string, firstName: string, over: Partial<InsightPayer> = {}): InsightPayer => ({
  id,
  firstName,
  rhythm: "WEEKLY",
  feeCents: 35_000,
  ...over,
});

// Thandi: two weekly fees unpaid. Sipho: always on time, and paid this week's fee early.
const insights = buildInsights({
  rows: [
    unpaid("t", "2026-10-14"),
    unpaid("t", "2026-10-21"),
    ...[28, 21, 14, 7].map((d) => row("s", addDays(TODAY, -d), { parentName: "Sipho Dlamini", childName: "Ayanda" })),
    row("s", "2026-10-23", { parentName: "Sipho Dlamini", childName: "Ayanda", paidOn: "2026-10-22" }),
  ],
  payers: [payer("t", "Thandi"), payer("s", "Sipho")],
  today: TODAY,
});
const input = buildAiInput(insights, "en");

const sentBody = () => JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as Record<string, unknown>;

describe("parseAiConfig", () => {
  it("is off unless AI_SUMMARY_ENABLED is exactly true", () => {
    expect(parseAiConfig({})).toEqual({ reason: "disabled" });
    for (const value of ["TRUE", "1", "yes", "false", ""]) {
      expect(parseAiConfig({ AI_SUMMARY_ENABLED: value, OPENAI_API_KEY: KEY })).toEqual({ reason: "disabled" });
    }
  });

  it("needs a key", () => {
    expect(parseAiConfig({ AI_SUMMARY_ENABLED: "true" })).toEqual({ reason: "no_key" });
    expect(parseAiConfig({ AI_SUMMARY_ENABLED: "true", OPENAI_API_KEY: "  " })).toEqual({ reason: "no_key" });
  });

  it("defaults to gpt-5.6-luna on low effort", () => {
    expect(parseAiConfig(ON)).toEqual({ config: cfg });
    expect(parseAiConfig({ ...ON, OPENAI_MODEL: "", OPENAI_REASONING_EFFORT: "" })).toEqual({ config: cfg });
    expect(parseAiConfig({ ...ON, OPENAI_MODEL: "gpt-5.6", OPENAI_REASONING_EFFORT: "medium" })).toEqual({
      config: { apiKey: KEY, model: "gpt-5.6", effort: "medium" },
    });
  });

  it("reports a bad model or effort instead of throwing", () => {
    expect(parseAiConfig({ ...ON, OPENAI_REASONING_EFFORT: "high" })).toEqual({ reason: "bad_config" });
    expect(parseAiConfig({ ...ON, OPENAI_MODEL: "gpt 5/../x" })).toEqual({ reason: "bad_config" });
  });
});

describe("createResponse", () => {
  it("posts to the Responses API with the effort, token limit and a timeout, and keeps nothing at OpenAI", async () => {
    fetchMock.mockResolvedValueOnce(answer("Hello."));
    await createResponse(cfg, { instructions: "Rules", input: '{"a":1}' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({ method: "POST" });
    expect(new Headers(init!.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody()).toEqual({
      model: "gpt-5.6-luna",
      instructions: "Rules",
      input: '{"a":1}',
      reasoning: { effort: "low" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    });
    expect(MAX_OUTPUT_TOKENS).toBe(1500);
  });

  it("joins the output_text parts of the message items", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "This week " }, { type: "output_text", text: "went well." }] },
        ],
      }),
    );
    expect(await createResponse(cfg, { instructions: "", input: "" })).toBe("This week went well.");
  });

  it.each([
    ["incomplete", () => answer("", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), "incomplete"],
    ["a refusal", () => json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }] }), "empty"],
    ["no text", () => answer("   "), "empty"],
    ["a failed response", () => answer("x", { status: "failed" }), "bad_response"],
    ["an answer it can't read", () => json({ unexpected: true }), "bad_response"],
    ["not JSON", () => new Response("<html>", { status: 200 }), "bad_response"],
    ["401", () => json({ error: { message: `Incorrect API key provided: ${KEY}` } }, 401), "http_401"],
    ["429", () => json({ error: { message: "Rate limit" } }, 429), "http_429"],
    ["500", () => new Response("oops", { status: 500 }), "http_500"],
  ])("fails on %s", async (_label, response, reason) => {
    fetchMock.mockResolvedValueOnce(response());
    const err = await createResponse(cfg, { instructions: "", input: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err).toMatchObject({ reason });
    // Never OpenAI's text, which can echo the key.
    expect((err as Error).message).not.toContain(KEY);
  });

  it("fails on a timeout or a network error", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(createResponse(cfg, { instructions: "", input: "" })).rejects.toMatchObject({ reason: "timeout" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(createResponse(cfg, { instructions: "", input: "" })).rejects.toMatchObject({ reason: "network" });
  });
});

describe("buildAiInput", () => {
  it("carries only first names, rhythms, badges, amounts and counts, and no dates", () => {
    expect(input).toEqual({
      language: "en",
      currency: "ZAR",
      totals: { expectedCents: 70_000, receivedCents: 35_000, outstandingCents: 35_000 },
      receivedShare: 0.5,
      outstanding: { dueTodayCents: 0, notSentCents: 0, lateCents: 35_000 },
      onTimeRate: 0.5,
      behind: { parents: 1, cents: 70_000 },
      parents: [
        { firstName: "Thandi", rhythm: "WEEKLY", badge: "NEEDS_SUPPORT", behindCents: 70_000 },
        { firstName: "Sipho", rhythm: "WEEKLY", badge: "RELIABLE", behindCents: 0 },
      ],
      suggestions: [
        { type: "OFFER_ARRANGEMENT", firstName: "Thandi" },
        { type: "REWARD_UPFRONT", count: 1 },
      ],
    });
  });

  it("rounds the on-time rate and the share received to whole percent", () => {
    const totals = { expectedCents: 90_000, receivedCents: 30_000, outstandingCents: 60_000 };
    expect(buildAiInput({ ...insights, totals, onTimeRate: 2 / 3 }, "zu")).toMatchObject({
      language: "zu",
      onTimeRate: 0.67,
      receivedShare: 0.33,
    });
    const nothingDue = { expectedCents: 0, receivedCents: 0, outstandingCents: 0 };
    expect(buildAiInput({ ...insights, totals: nothingDue }, "en").receivedShare).toBeNull();
  });
});

describe("instructionsFor", () => {
  const text = instructionsFor("en");

  it("asks for a headline in words, then a short note: no dates, at most 3 numbers, 2 parents, one action", () => {
    for (const rule of [
      'Line 1 is a short headline in words',
      "Half of this week's fees are in.",
      "No date and no digits in the headline.",
      `Under ${MAX_WORDS} words in all`,
      "Do not repeat the week's dates or read out the totals",
      "Use at most 3 numbers in all",
      "explain why they differ",
      "R1 450 of it is only due today.",
      "Name at most 2 parents",
      "End with exactly one suggested action",
    ]) {
      expect(text).toContain(rule);
    }
    expect(MAX_WORDS).toBe(60);
  });

  it("makes the AI say 'this week' with the weekly on-time rate", () => {
    expect(text).toContain('whenever you quote this rate, say "this week"');
  });

  it("asks for the owner's language, headline included", () => {
    expect(instructionsFor("st")).toContain("Write everything, the headline too, in Sesotho");
  });
});

describe("checkSummary", () => {
  const ok = (text: string) => expect(checkSummary(text, input)).toEqual({ ok: true, text });
  const bad = (text: string, reason: string, on: AiInput = input) => expect(checkSummary(text, on)).toEqual({ ok: false, reason });

  it("accepts plain text that uses only the input's numbers", () => {
    ok(
      "Half of this week's fees are in.\nThandi has R700 to catch up on, and R350 of it is from this week. 50% was paid on time this week. You could agree a payment plan with Thandi.",
    );
    ok("Over the last 7 days, 2 parents had fees due.");
    ok("1 parent paid early, and you could thank them.");
  });

  it("doesn't let the AI quote the week's dates (it isn't given them)", () => {
    bad("This week (19–25 Oct 2026) went well.", "bad_number");
  });

  it("reads amounts in any format as cents", () => {
    for (const amount of ["R700", "R 700", "R700.00", "R700,00", "R 700.00"]) ok(`Thandi has ${amount} to pay.`);
    const big = { ...input, totals: { ...input.totals, expectedCents: 420_050 } };
    for (const amount of ["R4 200.50", "R4,200.50", "R4200.50", "R4 200.50", "R4 200,50"]) {
      expect(checkSummary(`You expected ${amount}.`, big)).toMatchObject({ ok: true });
    }
  });

  it("throws away a number that isn't in the input", () => {
    bad("You received R360 this week.", "bad_number");
    bad("You received R4 200 this week.", "bad_number");
    bad("Thandi has R700.50 to pay.", "bad_number");
    bad("6 parents paid on time.", "bad_number");
    bad("51% was paid on time.", "bad_number");
    bad("The rate was 0.5 this week.", "bad_number");
    bad("Thandi is 2 weeks behind and owes R70k.", "bad_number");
  });

  it("throws away empty, long, formatted or linked text", () => {
    bad("   ", "empty");
    bad(`${"Thandi has R700 to pay. ".repeat(30)}`, "too_long");
    for (const text of [
      "**Thandi** has R700 to pay.",
      "# This week",
      "Summary:\n- Thandi has R700 to pay.",
      "Summary:\n1. Thandi has R700 to pay.",
      "Thandi has <b>R700</b> to pay.",
      "See [the dashboard](x).",
      "Pay at https://pay.example now.",
      "Visit www.example.org.",
      "Visit thusa.co.za today.",
      "Thandi has R700 to pay 👍.",
    ]) {
      bad(text, "bad_format");
    }
  });

  it("throws away a guess at a parent's gender in English", () => {
    bad("Thandi has R700 to pay; she could use a payment plan.", "bad_format");
    expect(checkSummary("U-Thandi usasele no-R700.", { ...input, language: "zu" })).toMatchObject({ ok: true });
  });

  it("keeps the headline on its own line and makes the rest one paragraph", () => {
    expect(checkSummary("  Half of this week's fees are in.  \n\n Thandi has\nR700   to pay. ", input)).toEqual({
      ok: true,
      text: "Half of this week's fees are in.\nThandi has R700 to pay.",
    });
    expect(checkSummary("  Thandi has R700 to pay.  ", input)).toEqual({ ok: true, text: "Thandi has R700 to pay." });
  });
});

describe("summarise", () => {
  const logLines = () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(line));
    return lines;
  };

  it("falls back without calling OpenAI when it's off or there's no key", async () => {
    const lines = logLines();
    expect(await summarise(insights, "en", {})).toEqual({ source: "fallback", reason: "disabled", ...plainWords(insights, "en") });
    expect(await summarise(insights, "zu", { AI_SUMMARY_ENABLED: "true" })).toEqual({
      source: "fallback",
      reason: "no_key",
      ...plainWords(insights, "zu"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines.map((l) => JSON.parse(l))).toMatchObject([
      { event: "ai.summary_fallback", reason: "disabled" },
      { event: "ai.summary_fallback", reason: "no_key" },
    ]);
  });

  it("returns the AI's text when it passes the checks", async () => {
    fetchMock.mockResolvedValueOnce(answer("This week you received R350 of R700. You could agree a payment plan with Thandi."));
    expect(await summarise(insights, "en", ON)).toEqual({
      source: "ai",
      text: "This week you received R350 of R700. You could agree a payment plan with Thandi.",
    });
    const body = sentBody();
    expect(body.instructions).toContain("in English.");
    expect(JSON.parse(String(body.input))).toEqual(input);
  });

  it("asks for the owner's language", async () => {
    fetchMock.mockResolvedValueOnce(answer("Kuleli sonto uthole u-R350."));
    expect(await summarise(insights, "zu", ON)).toMatchObject({ source: "ai" });
    expect(sentBody().instructions).toContain("in isiZulu.");
    expect(JSON.parse(String(sentBody().input))).toMatchObject({ language: "zu" });
  });

  it.each([
    ["a timeout", () => Promise.reject(new DOMException("timeout", "TimeoutError")), "timeout"],
    ["an error", () => Promise.resolve(json({ error: { message: "Server error" } }, 500)), "http_500"],
    ["a number not in the input", () => Promise.resolve(answer("You received R9 999 this week.")), "bad_number"],
    ["markdown", () => Promise.resolve(answer("**Well done.**")), "bad_format"],
  ])("falls back on %s, and logs only the reason", async (_label, response, reason) => {
    const lines = logLines();
    fetchMock.mockImplementationOnce(response);
    expect(await summarise(insights, "en", ON)).toEqual({ source: "fallback", reason, ...plainWords(insights, "en") });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ level: "warn", event: "ai.summary_fallback", time: expect.any(String), reason });
  });

  it("sends no phone numbers, account numbers, references, surnames, children's names or links", async () => {
    fetchMock.mockResolvedValueOnce(answer("Fine."));
    await summarise(insights, "en", ON);
    const body = JSON.stringify(sentBody());
    for (const leak of ["Mokoena", "Dlamini", "Lerato", "Ayanda", "THK7Q2M9XA", "stitch.money", "+27", "082"]) {
      expect(body).not.toContain(leak);
    }
    // No phone or account number: no run of 7+ digits outside an amount in cents.
    expect(String(sentBody().input).match(/\d{7,}/g)).toBeNull();
  });

  it("never puts one business's parents in another business's request", async () => {
    const other = buildInsights({
      rows: [unpaid("x", "2026-10-21", { parentName: "Nomvula Khumalo", childName: "Siyabonga", amountCents: 145_000 })],
      payers: [payer("x", "Nomvula", { feeCents: 145_000 })],
      today: TODAY,
    });
    fetchMock.mockResolvedValueOnce(answer("Fine.")).mockResolvedValueOnce(answer("Fine."));
    await summarise(insights, "en", ON);
    await summarise(other, "en", ON);
    const [first, second] = fetchMock.mock.calls.map(([, init]) => String(init!.body));
    expect(first).toContain("Thandi");
    expect(first).not.toContain("Nomvula");
    expect(second).toContain("Nomvula");
    expect(second).not.toContain("Thandi");
    expect(second).not.toContain("Sipho");
  });
});

describe("boundaries", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const source = (file: string) => readFileSync(file, "utf8");

  it("calls api.openai.com only from src/ai/client.ts", () => {
    const callers = files("src").filter((f) => source(f).includes("api.openai.com"));
    expect(callers.map((f) => f.replace(/\\/g, "/"))).toEqual(["src/ai/client.ts"]);
  });

  it("never lets messages to parents use the AI", () => {
    for (const file of [...files("src/messaging"), "src/lib/parent-messages.ts", "src/lib/reminders.ts", ...files("src/jobs")]) {
      expect(source(file), file).not.toMatch(/from "(@\/ai|\.\.?\/(\.\.\/)*ai)(\/[^"]*)?"/);
    }
  });

  it("keeps the AI code away from sending messages", () => {
    for (const file of files("src/ai")) {
      const imports = [...source(file).matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      for (const path of imports.filter((p) => p.startsWith("@/messaging"))) expect(path, file).toBe("@/messaging/templates/types");
      expect(imports.some((p) => /parent-messages|reminders|collections|payments/.test(p)), file).toBe(false);
    }
  });
});
