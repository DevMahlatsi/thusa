// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// Uses the mock payment provider (PAYMENTS_PROVIDER is unset in tests).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: payment requests and tenant isolation", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { archivePayer, createPayer, listPayers, payerInputSchema, updatePayer } = await import("@/lib/payers");
  const { loadInsights } = await import("@/lib/insights/load");
  const { summarise } = await import("@/ai/summary");
  const { listCollectionRows, MAX_REQUESTS_PER_DAY, requestCollection } = await import("@/lib/collections");
  const { mockProvider } = await import("@/payments/mock");

  const profile = { town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;
  // Weekly on Fridays: due 2, 9, 16, 23 and 30 October 2026.
  const input = payerInputSchema.parse({
    parentName: "Thandi Mokoena",
    childName: "Lerato",
    phone: "082 123 4567",
    schedule: { amountCents: 30_000, rhythm: "WEEKLY", payday: 5, startsOn: "2026-10-01" },
  });
  // Friday 23 October 2026, 10:00 SA time.
  const now = new Date("2026-10-23T10:00:00+02:00");

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };
  let payerId: string;

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await db().auditLog.deleteMany();
    // The ledger and consents refuse DELETE (append-only); TRUNCATE is how tests clear them.
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
    payerId = (await createPayer(a, input)).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a request for the amount in the stored schedule", async () => {
    const { collection, sent } = await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    expect(sent).toBe(true);
    expect(collection).toMatchObject({
      businessId: a.businessId,
      amountCents: 30_000,
      rhythm: "WEEKLY",
      status: "PENDING",
      paidCents: 0,
      provider: "mock",
      requestedByUserId: a.userId,
    });
    expect(collection.reference).toMatch(/^TH[2-9A-Z]{8}$/);
    expect(collection.providerRequestId).toMatch(/^mock_/);
    expect(collection.requestedAt).not.toBeNull();

    const log = await db().auditLog.findFirstOrThrow({ where: { action: "collection.requested" } });
    expect(log.metadata).toMatchObject({ collectionId: collection.id, amountCents: 30_000, reference: collection.reference });
    expect(JSON.stringify(log.metadata)).not.toContain("4567");
  });

  it("gives every request its own reference and idempotency key", async () => {
    const first = await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    const second = await requestCollection(a, { payerId, dueDate: "2026-10-30" }, now);
    expect(second.collection.reference).not.toBe(first.collection.reference);
    expect(second.collection.idempotencyKey).not.toBe(first.collection.idempotencyKey);
  });

  it("returns the existing request when asked twice, without calling the provider again", async () => {
    const spy = vi.spyOn(mockProvider, "createPaymentRequest");
    const first = await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    const again = await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    expect(again).toEqual({ collection: first.collection, sent: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await db().collection.count()).toBe(1);
  });

  it("keeps a sent request's amount when the schedule changes later", async () => {
    await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    await updatePayer(a, payerId, { ...input, phone: undefined, schedule: { ...input.schedule, amountCents: 45_000 } });
    const later = await requestCollection(a, { payerId, dueDate: "2026-10-30" }, now);
    const rows = await listCollectionRows(a.businessId, 2026, 10);
    expect(rows.map((r) => [r.dueDate, r.amountCents])).toEqual([
      ["2026-10-23", 30_000],
      ["2026-10-30", 45_000],
    ]);
    expect(later.collection.amountCents).toBe(45_000);
  });

  it("never lets another business request, or see, a payer's collections", async () => {
    await expect(requestCollection(b, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 404 });
    expect(await db().collection.count()).toBe(0);

    await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    expect(await listCollectionRows(b.businessId, 2026, 10)).toEqual([]);
    expect(await listCollectionRows(a.businessId, 2026, 10)).toHaveLength(1);
  });

  it("works out the week's insights from this business's collections only, across a month end", async () => {
    await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    await requestCollection(a, { payerId, dueDate: "2026-10-30" }, now);
    const scheduled = async (businessId: string) =>
      (await listPayers(businessId)).map((p) => ({
        id: p.id,
        parentName: p.parentName,
        childName: p.childName,
        schedule: p.schedule && {
          amountCents: p.schedule.amountCents,
          rhythm: p.schedule.rhythm,
          payday: p.schedule.payday,
          startsOn: p.schedule.startsOn.toISOString().slice(0, 10),
        },
      }));

    // Sunday 1 November: the week is 26 Oct – 1 Nov, and both October fees are still unpaid.
    const insights = await loadInsights(a.businessId, await scheduled(a.businessId), "2026-11-01");
    expect(insights.totals).toEqual({ expectedCents: 30_000, receivedCents: 0, outstandingCents: 30_000 });
    expect(insights.parents).toEqual([expect.objectContaining({ firstName: "Thandi", badge: "NEEDS_SUPPORT", behindCents: 60_000 })]);
    expect(insights.suggestions).toEqual([expect.objectContaining({ type: "OFFER_ARRANGEMENT", firstName: "Thandi" })]);

    const other = await loadInsights(b.businessId, await scheduled(b.businessId), "2026-11-01");
    expect(other.totals).toEqual({ expectedCents: 0, receivedCents: 0, outstandingCents: 0 });
    expect(other.parents).toEqual([]);

    // What would go to OpenAI for another business, with its own parent, carries nothing of A's.
    await createPayer(b, { ...input, parentName: "Sipho Dlamini", childName: "Ayanda", phone: "082 765 4321" });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Fine." }] }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const ai = { AI_SUMMARY_ENABLED: "true", OPENAI_API_KEY: "sk-test-not-a-real-key" }; // gitleaks:allow
      await summarise(await loadInsights(b.businessId, await scheduled(b.businessId), "2026-11-01"), "en", ai);
      const body = String(fetchMock.mock.calls[0]![1]!.body);
      expect(body).toContain("Sipho");
      for (const leak of ["Thandi", "Mokoena", "Dlamini", "Ayanda", "Lerato", "60000"]) expect(body).not.toContain(leak);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["a day that isn't a payday", "2026-10-22"],
    ["next month", "2026-11-06"],
    ["last month", "2026-09-25"],
    ["a date that doesn't exist", "2026-10-32"],
  ])("refuses %s", async (_label, dueDate) => {
    await expect(requestCollection(a, { payerId, dueDate }, now)).rejects.toMatchObject({ status: 400 });
    expect(await db().collection.count()).toBe(0);
  });

  it("refuses a due date more than a week ahead", async () => {
    const early = new Date("2026-10-02T10:00:00+02:00");
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-16" }, early)).rejects.toMatchObject({ status: 400 });
    expect((await requestCollection(a, { payerId, dueDate: "2026-10-09" }, early)).sent).toBe(true);
  });

  it("refuses archived parents", async () => {
    await archivePayer(a, payerId);
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 404 });
  });

  it("retries a failed provider call with the same reference and idempotency key", async () => {
    const spy = vi.spyOn(mockProvider, "createPaymentRequest").mockRejectedValueOnce(new Error("timeout"));
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 502 });

    const pending = await db().collection.findFirstOrThrow();
    expect(pending).toMatchObject({ providerRequestId: null, sendingSince: null, status: "PENDING" });
    expect((await listCollectionRows(a.businessId, 2026, 10))[0]).toMatchObject({ requested: false });

    const { collection, sent } = await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now);
    expect(sent).toBe(true);
    expect(collection).toMatchObject({ id: pending.id, reference: pending.reference, idempotencyKey: pending.idempotencyKey });
    expect(spy.mock.calls.map(([call]) => call.idempotencyKey)).toEqual([pending.idempotencyKey, pending.idempotencyKey]);
  });

  it("won't send while another attempt is with the provider", async () => {
    vi.spyOn(mockProvider, "createPaymentRequest").mockRejectedValueOnce(new Error("timeout"));
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 502 });
    await db().collection.updateMany({ data: { sendingSince: new Date() } });
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 409 });

    // A claim older than a minute is treated as abandoned.
    await db().collection.updateMany({ data: { sendingSince: new Date(Date.now() - 120_000) } });
    expect((await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).sent).toBe(true);
  });

  it("caps new requests per business per day", async () => {
    const other = await createPayer(a, { ...input, childName: "Sipho" });
    await db().collection.createMany({
      data: Array.from({ length: MAX_REQUESTS_PER_DAY }, (_, i) => ({
        businessId: a.businessId,
        payerId: other.id,
        dueDate: new Date(Date.UTC(2020, 0, 1 + i)),
        amountCents: 100,
        rhythm: "WEEKLY" as const,
        reference: `TEST${i}`,
        idempotencyKey: `test-${i}`,
        provider: "mock",
      })),
    });
    await expect(requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).rejects.toMatchObject({ status: 429 });
    // Business B has its own allowance.
    const theirs = await createPayer(b, input);
    expect((await requestCollection(b, { payerId: theirs.id, dueDate: "2026-10-23" }, now)).sent).toBe(true);
  });

  describe("database backstops", () => {
    const row = (over: object) => ({
      businessId: a.businessId,
      payerId,
      dueDate: new Date("2026-10-23"),
      amountCents: 100,
      rhythm: "WEEKLY" as const,
      reference: "TESTREF",
      idempotencyKey: "test-key",
      provider: "mock",
      ...over,
    });

    it("won't link a collection to another business's payer", async () => {
      await expect(db().collection.create({ data: row({ businessId: b.businessId }) })).rejects.toThrow();
    });

    it.each([[{ amountCents: 0 }], [{ amountCents: -100 }], [{ paidCents: -1 }]])(
      "rejects bad amounts even without the service %#",
      async (change) => {
        await expect(db().collection.create({ data: row(change) })).rejects.toThrow();
      },
    );

    it("allows only one collection per payer per due date", async () => {
      await db().collection.create({ data: row({}) });
      await expect(db().collection.create({ data: row({ reference: "OTHER", idempotencyKey: "other" }) })).rejects.toThrow();
    });
  });
});
