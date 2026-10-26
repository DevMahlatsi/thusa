// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// Stored AI summaries (src/ai/stored-summary.ts): when the dashboard may call OpenAI, reuse, the failure
// wait, the daily cap, Refresh, and one business never seeing another's. fetch is stubbed; nothing here
// reaches OpenAI.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: stored AI summaries", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { createPayer, listScheduledPayers, payerInputSchema } = await import("@/lib/payers");
  const { requestCollection } = await import("@/lib/collections");
  const { loadInsights } = await import("@/lib/insights/load");
  const { MAX_CALLS_PER_DAY, MAX_REFRESHES_PER_DAY, refreshSummary, shownSummary } = await import("@/ai/stored-summary");

  const profile = { town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;
  const parent = (parentName: string, childName: string, phone: string) =>
    payerInputSchema.parse({
      parentName,
      childName,
      phone,
      schedule: { amountCents: 30_000, rhythm: "WEEKLY", payday: 5, startsOn: "2026-10-01" },
    });
  // Friday 23 October 2026, 10:00 SA time.
  const now = new Date("2026-10-23T10:00:00+02:00");
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  const ON = { AI_SUMMARY_ENABLED: "true", OPENAI_API_KEY: "sk-test-not-a-real-key" }; // gitleaks:allow

  const fetchMock = vi.fn<typeof fetch>();
  const answer = (text: string) =>
    new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
  const aiCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://api.openai.com/"));

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };
  let collectionId: string;

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }
  const insightsFor = async (businessId: string) => loadInsights(businessId, await listScheduledPayers(businessId), "2026-10-23");
  const show = async (businessId: string, at = now, language: "en" | "zu" = "en") =>
    shownSummary(businessId, await insightsFor(businessId), language, { isSample: false, now: at, source: ON });
  const refresh = async (ctx: typeof a, at: Date) => refreshSummary(ctx, await insightsFor(ctx.businessId), "en", { now: at, source: ON });
  const rows = (businessId: string) => db().aiSummary.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });

  beforeEach(async () => {
    await db().auditLog.deleteMany();
    await db().$executeRaw`TRUNCATE "LedgerEntry", "WebhookEvent", "MessagingConsent"`;
    await db().message.deleteMany();
    await db().balanceRequest.deleteMany();
    await db().collection.deleteMany();
    await db().schedule.deleteMany();
    await db().payerInvite.deleteMany();
    await db().payer.deleteMany();
    await db().session.deleteMany();
    await db().user.deleteMany();
    await db().aiSummary.deleteMany();
    await db().business.deleteMany();
    a = await owner("+27820000001", "Crèche A");
    b = await owner("+27820000002", "Crèche B");
    const thandi = await createPayer(a, parent("Thandi Mokoena", "Lerato", "082 123 4567"));
    await createPayer(b, parent("Sipho Dlamini", "Ayanda", "082 765 4321"));
    collectionId = (await requestCollection(a, { payerId: thandi.id, dueDate: "2026-10-23" }, now)).collection.id;
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async () => answer("Thandi has a fee due today."));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("calls once, then reuses the stored summary for 24 hours", async () => {
    expect(await show(a.businessId)).toEqual({ source: "ai", text: "Thandi has a fee due today." });
    expect(await rows(a.businessId)).toMatchObject([{ status: "OK", language: "en", text: "Thandi has a fee due today." }]);

    fetchMock.mockImplementation(async () => answer("Something new."));
    expect(await show(a.businessId, later(60))).toEqual({ source: "ai", text: "Thandi has a fee due today." });
    expect(aiCalls()).toHaveLength(1);
    // Each language is its own summary.
    expect(await show(a.businessId, later(61), "zu")).toEqual({ source: "ai", text: "Something new." });
    expect(aiCalls()).toHaveLength(2);
    // A day later, a new one.
    expect(await show(a.businessId, later(24 * 60 + 1))).toEqual({ source: "ai", text: "Something new." });
    expect(aiCalls()).toHaveLength(3);
  });

  it("calls again after a new payment comes in", async () => {
    await show(a.businessId);
    await db().ledgerEntry.create({
      data: {
        businessId: a.businessId,
        collectionId,
        kind: "PAYMENT",
        amountCents: 30_000,
        provider: "mock",
        providerPaymentId: "pay_1",
        occurredAt: later(5),
        createdAt: later(5),
      },
    });
    fetchMock.mockImplementation(async () => answer("Thandi has paid."));
    expect(await show(a.businessId, later(6))).toEqual({ source: "ai", text: "Thandi has paid." });
    expect(aiCalls()).toHaveLength(2);
  });

  it("never gives one business another's summary, or its parents", async () => {
    await show(a.businessId);
    fetchMock.mockImplementation(async () => answer("Sipho is new."));
    expect(await show(b.businessId)).toEqual({ source: "ai", text: "Sipho is new." });
    expect(aiCalls()).toHaveLength(2);
    const [first, second] = aiCalls().map(([, init]) => String(init!.body));
    expect(first).toContain("Thandi");
    expect(second).toContain("Sipho");
    expect(second).not.toContain("Thandi");
    expect(await show(a.businessId, later(1))).toEqual({ source: "ai", text: "Thandi has a fee due today." });
    expect(await rows(b.businessId)).toHaveLength(1);

    await refresh(b, later(2));
    expect(await rows(a.businessId)).toHaveLength(1);
  });

  it("after a failed call, shows the rule-based sentences for 15 minutes without calling", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    const failed = await show(a.businessId);
    expect(failed).toMatchObject({ source: "fallback" });
    expect(await rows(a.businessId)).toMatchObject([{ status: "FAILED", failureReason: "http_500", text: null }]);

    fetchMock.mockImplementation(async () => answer("Back again."));
    expect(await show(a.businessId, later(14))).toEqual(failed);
    expect(aiCalls()).toHaveLength(1);
    expect(await show(a.businessId, later(16))).toEqual({ source: "ai", text: "Back again." });
    expect(aiCalls()).toHaveLength(2);
  });

  it(`makes at most ${MAX_CALLS_PER_DAY} calls per business per SA day, Refresh included`, async () => {
    const attempt = (createdAt: Date) => ({
      businessId: a.businessId,
      language: "en" as const,
      periodStart: new Date("2026-10-17T00:00:00Z"),
      status: "FAILED" as const,
      failureReason: "timeout",
      createdAt,
    });
    // Yesterday's attempts don't count.
    await db().aiSummary.createMany({ data: Array.from({ length: MAX_CALLS_PER_DAY }, () => attempt(later(-11 * 60))) });
    expect(await show(a.businessId)).toMatchObject({ source: "ai" });
    expect(aiCalls()).toHaveLength(1);

    await db().aiSummary.createMany({ data: Array.from({ length: MAX_CALLS_PER_DAY - 1 }, () => attempt(later(-60))) });
    await db().ledgerEntry.create({
      data: { businessId: a.businessId, collectionId, kind: "PAYMENT", amountCents: 30_000, provider: "mock", providerPaymentId: "p", occurredAt: later(1), createdAt: later(1) },
    });
    expect(await show(a.businessId, later(2))).toMatchObject({ source: "fallback" });
    await expect(refresh(a, later(3))).rejects.toMatchObject({ status: 429 });
    expect(aiCalls()).toHaveLength(1);
    // Other businesses have their own cap.
    expect(await show(b.businessId, later(4))).toMatchObject({ source: "ai" });
  });

  it("never calls or stores anything for sample data or with the AI switched off", async () => {
    const insights = await insightsFor(a.businessId);
    expect(await shownSummary(a.businessId, insights, "en", { isSample: true, now, source: ON })).toMatchObject({ source: "fallback" });
    expect(await shownSummary(a.businessId, insights, "en", { isSample: false, now, source: {} })).toMatchObject({ source: "fallback" });
    await expect(refreshSummary(a, insights, "en", { now, source: { AI_SUMMARY_ENABLED: "true" } })).rejects.toMatchObject({ status: 503 });
    expect(aiCalls()).toHaveLength(0);
    expect(await db().aiSummary.count()).toBe(0);
  });

  it("doesn't call while another call is still running", async () => {
    await db().aiSummary.create({
      data: { businessId: a.businessId, language: "en", periodStart: new Date("2026-10-17T00:00:00Z"), status: "PENDING", createdAt: later(-0.5) },
    });
    expect(await show(a.businessId)).toMatchObject({ source: "fallback" });
    await expect(refresh(a, now)).rejects.toMatchObject({ status: 409 });
    expect(aiCalls()).toHaveLength(0);
    // A call that died (still PENDING minutes later) doesn't block a Refresh.
    await refresh(a, later(3));
    expect(aiCalls()).toHaveLength(1);
  });

  it(`Refresh skips the 24 h reuse and the 15-minute wait, ${MAX_REFRESHES_PER_DAY} times a day`, async () => {
    await show(a.businessId);
    fetchMock.mockImplementation(async () => answer("Refreshed."));
    await refresh(a, later(1));
    expect(await show(a.businessId, later(2))).toEqual({ source: "ai", text: "Refreshed." });

    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    await expect(refresh(a, later(3))).rejects.toMatchObject({ status: 502 });
    // The last good summary still shows.
    expect(await show(a.businessId, later(4))).toEqual({ source: "ai", text: "Refreshed." });

    fetchMock.mockImplementation(async () => answer("Third time."));
    for (const minute of [5, 6, 7]) await refresh(a, later(minute));
    await expect(refresh(a, later(8))).rejects.toMatchObject({ status: 429 });
    expect(aiCalls()).toHaveLength(1 + MAX_REFRESHES_PER_DAY);
    const audits = await db().auditLog.findMany({ where: { action: "ai.summary_refreshed" } });
    expect(audits).toHaveLength(MAX_REFRESHES_PER_DAY);
    expect(audits.every((r) => r.businessId === a.businessId && r.userId === a.userId)).toBe(true);
    expect(audits[0]!.metadata).toEqual({ language: "en" });
  });
});
