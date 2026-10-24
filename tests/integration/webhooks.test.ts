// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// The mock provider signs its webhooks like Stitch's (Svix), so the whole path runs here.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: payment webhooks and the ledger", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { createPayer, payerInputSchema } = await import("@/lib/payers");
  const { listCollectionRows, requestCollection } = await import("@/lib/collections");
  const { handlePaymentWebhook } = await import("@/lib/payment-webhooks");
  const { mockProvider, simulatePayment } = await import("@/payments/mock");

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
  let collection: Awaited<ReturnType<typeof requestCollection>>["collection"];

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }

  const pay = (over: { amountCents?: number; reference?: string; paidAt?: Date } = {}) => {
    const { rawBody, headers } = simulatePayment(
      {
        providerRequestId: collection.providerRequestId!,
        amountCents: over.amountCents ?? collection.amountCents,
        reference: over.reference ?? collection.reference,
      },
      over.paidAt,
    );
    return { rawBody, headers, send: () => handlePaymentWebhook(rawBody, headers, mockProvider) };
  };

  const current = () => db().collection.findUniqueOrThrow({ where: { id: collection.id } });

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await db().auditLog.deleteMany();
    // The ledger refuses DELETE (append-only); TRUNCATE is how tests clear it.
    await db().$executeRaw`TRUNCATE "LedgerEntry", "WebhookEvent"`;
    await db().message.deleteMany();
    await db().balanceRequest.deleteMany();
    await db().collection.deleteMany();
    await db().schedule.deleteMany();
    await db().payer.deleteMany();
    await db().session.deleteMany();
    await db().user.deleteMany();
    await db().business.deleteMany();
    a = await owner("+27820000001", "Crèche A");
    b = await owner("+27820000002", "Crèche B");
    const payerId = (await createPayer(a, input)).id;
    collection = (await requestCollection(a, { payerId, dueDate: "2026-10-23" }, now)).collection;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a collection PAID from a verified, reconfirmed payment and writes one ledger entry", async () => {
    expect(await pay({ paidAt: new Date("2026-10-23T09:00:00+02:00") }).send()).toMatchObject({
      status: 200,
      body: { outcome: "processed" },
    });

    expect(await current()).toMatchObject({ status: "PAID", paidCents: 30_000 });
    const entries = await db().ledgerEntry.findMany();
    expect(entries).toEqual([
      expect.objectContaining({ businessId: a.businessId, collectionId: collection.id, kind: "PAYMENT", amountCents: 30_000 }),
    ]);
    const log = await db().auditLog.findFirstOrThrow({ where: { action: "collection.paid" } });
    expect(log).toMatchObject({ businessId: a.businessId, userId: null });
    expect(JSON.stringify(log.metadata)).not.toContain("4567");

    // The dashboard sees it, paid on the due date.
    const [row] = await listCollectionRows(a.businessId, 2026, 10);
    expect(row).toMatchObject({ status: "PAID", paidCents: 30_000, paidOnTime: true });
    expect(await listCollectionRows(b.businessId, 2026, 10)).toEqual([]);
  });

  it("counts a payment after the due date as paid, but not on time", async () => {
    await pay({ paidAt: new Date("2026-10-24T08:00:00+02:00") }).send();
    expect((await listCollectionRows(a.businessId, 2026, 10))[0]).toMatchObject({ status: "PAID", paidOnTime: false });
  });

  it("ignores the same delivery a second time", async () => {
    const delivery = pay();
    await delivery.send();
    expect(await delivery.send()).toMatchObject({ status: 200, body: { outcome: "duplicate" } });
    expect(await db().ledgerEntry.count()).toBe(1);
    expect(await db().auditLog.count({ where: { action: "collection.paid" } })).toBe(1);
  });

  it("never credits one payment twice, even under a new delivery id", async () => {
    await pay().send();
    expect(await pay().send()).toMatchObject({ status: 200, body: { outcome: "already_credited" } });
    expect(await db().ledgerEntry.count()).toBe(1);
    expect((await current()).paidCents).toBe(30_000);
  });

  it("refuses a bad signature and changes nothing", async () => {
    const delivery = pay();
    const result = await handlePaymentWebhook(delivery.rawBody.replace("payment.paid", "payment.paid "), delivery.headers, mockProvider);
    expect(result.status).toBe(401);
    expect(await current()).toMatchObject({ status: "PENDING", paidCents: 0 });
    expect(await db().webhookEvent.count()).toBe(0);
  });

  it("stays PENDING when the provider doesn't confirm, and processes the replay once it does", async () => {
    const delivery = pay();
    vi.spyOn(mockProvider, "confirmPayment").mockResolvedValueOnce(null);
    expect(await delivery.send()).toMatchObject({ status: 503 });
    expect(await current()).toMatchObject({ status: "PENDING", paidCents: 0 });
    // Not recorded as seen, so the provider's retry still runs.
    expect(await db().webhookEvent.count()).toBe(0);

    expect(await delivery.send()).toMatchObject({ status: 200, body: { outcome: "processed" } });
    expect((await current()).status).toBe("PAID");
  });

  it("stays PENDING when the provider can't be reached", async () => {
    vi.spyOn(mockProvider, "confirmPayment").mockRejectedValueOnce(new Error("timeout"));
    expect(await pay().send()).toMatchObject({ status: 503 });
    expect((await current()).status).toBe("PENDING");
  });

  it("won't credit a payment whose reference isn't this collection's", async () => {
    expect(await pay({ reference: "THOTHERREF" }).send()).toMatchObject({ status: 200, body: { outcome: "mismatch" } });
    expect(await current()).toMatchObject({ status: "PENDING", paidCents: 0 });
    expect(await db().ledgerEntry.count()).toBe(0);
  });

  it("acknowledges payments for requests it doesn't know, without touching anything", async () => {
    const { rawBody, headers } = simulatePayment({ providerRequestId: "mock_someone-else", amountCents: 100, reference: "X" });
    expect(await handlePaymentWebhook(rawBody, headers, mockProvider)).toMatchObject({ status: 200, body: { outcome: "ignored" } });
    expect(await db().ledgerEntry.count()).toBe(0);
  });

  it("marks a short payment PARTIAL with what was paid", async () => {
    await pay({ amountCents: 10_000 }).send();
    expect(await current()).toMatchObject({ status: "PARTIAL", paidCents: 10_000, paidAt: null });
  });

  describe("ledger backstops", () => {
    it("refuses to change or delete an entry", async () => {
      await pay().send();
      const entry = await db().ledgerEntry.findFirstOrThrow();
      await expect(db().ledgerEntry.update({ where: { id: entry.id }, data: { amountCents: 1 } })).rejects.toThrow();
      await expect(db().ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
      expect((await db().ledgerEntry.findFirstOrThrow()).amountCents).toBe(30_000);
    });

    it("won't attach an entry to another business's collection", async () => {
      await expect(
        db().ledgerEntry.create({
          data: {
            businessId: b.businessId,
            collectionId: collection.id,
            kind: "PAYMENT",
            amountCents: 100,
            provider: "mock",
            providerPaymentId: "forged",
            occurredAt: now,
          },
        }),
      ).rejects.toThrow();
    });

    it("refuses a payment of zero or less", async () => {
      await expect(
        db().ledgerEntry.create({
          data: {
            businessId: a.businessId,
            collectionId: collection.id,
            kind: "PAYMENT",
            amountCents: 0,
            provider: "mock",
            providerPaymentId: "zero",
            occurredAt: now,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
