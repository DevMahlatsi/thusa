// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// Messages to parents, reminders, part-payments (balance requests) and the daily job. Payments use the
// mock provider; Clickatell is reached through a stubbed fetch, never the network.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: messages, reminders, part-payments and the daily job", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { archivePayer, createPayer, payerInputSchema } = await import("@/lib/payers");
  const { listCollectionRows, requestCollection } = await import("@/lib/collections");
  const { listMessages, messageParent } = await import("@/lib/parent-messages");
  const { MAX_REMINDERS, sendReminder } = await import("@/lib/reminders");
  const { requestBalance } = await import("@/lib/balance-requests");
  const { handlePaymentWebhook } = await import("@/lib/payment-webhooks");
  const { runDailyJobs } = await import("@/jobs/daily");
  const { devOutbox } = await import("@/messaging/adapter");
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
  const day = (ymd: string) => new Date(`${ymd}T10:00:00+02:00`);

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };
  let payerId: string;

  const fetchMock = vi.fn<typeof fetch>();
  const accepted = () =>
    new Response(JSON.stringify({ messages: [{ apiMessageId: "ct-1", accepted: true, error: null }] }), { status: 202 });

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }

  const request = async (dueDate = "2026-10-23", at = now) => (await requestCollection(a, { payerId, dueDate }, at)).collection;

  async function pay(target: { providerRequestId: string | null; reference: string }, amountCents: number) {
    const { rawBody, headers } = simulatePayment({ providerRequestId: target.providerRequestId!, amountCents, reference: target.reference });
    return handlePaymentWebhook(rawBody, headers, mockProvider);
  }

  const messages = (kind?: "PAYMENT_REQUEST" | "REMINDER" | "BALANCE_REQUEST") =>
    db().message.findMany({ where: { kind }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await db().auditLog.deleteMany();
    await db().$executeRaw`TRUNCATE "LedgerEntry", "WebhookEvent"`;
    await db().message.deleteMany();
    await db().balanceRequest.deleteMany();
    await db().collection.deleteMany();
    await db().schedule.deleteMany();
    await db().payer.deleteMany();
    await db().session.deleteMany();
    await db().user.deleteMany();
    await db().aiSummary.deleteMany();
    await db().business.deleteMany();
    devOutbox().length = 0;
    a = await owner("+27820000001", "Sunshine Crèche");
    b = await owner("+27820000002", "Crèche B");
    payerId = (await createPayer(a, input)).id;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("payment request messages", () => {
    it("writes the parent a payment request message, with the phone masked, once per request", async () => {
      const collection = await request();
      await request();

      const message = (await messages())[0]!;
      expect(await db().message.count()).toBe(1);
      expect(message).toMatchObject({
        businessId: a.businessId,
        collectionId: collection.id,
        kind: "PAYMENT_REQUEST",
        template: "payment_request",
        language: "en",
        phoneMasked: "••••4567",
        sentByUserId: a.userId,
        dedupeKey: `request:${collection.id}`,
        // No Clickatell key in tests: the dev outbox gets it, and it's marked as not delivered.
        status: "NOT_DELIVERED",
        note: "dev_outbox",
      });
      // "è" is in the GSM alphabet, so it stays. The mock has no payment page, so there is no link.
      expect(message.body).toContain("Sunshine Crèche: Lerato's fees of R300.00 are due on 23/10/2026.");
      expect(message.body).toContain(`Pay with reference ${collection.reference}.`);
      expect(message.body).not.toContain("123 4567");
      expect(devOutbox()).toHaveLength(1);
    });

    it("sends through Clickatell when it's configured", async () => {
      vi.stubEnv("CLICKATELL_API_KEY", "test-api-key");
      fetchMock.mockResolvedValueOnce(accepted());
      await request();

      expect(await messages()).toEqual([expect.objectContaining({ status: "SENT", provider: "clickatell", providerMessageId: "ct-1", note: null })]);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://platform.clickatell.com/v1/message");
      expect(JSON.parse(init?.body as string).messages[0].to).toBe("27821234567");
    });

    it("keeps the payment request when Clickatell refuses the message, and a retry under the same key sends it", async () => {
      vi.stubEnv("CLICKATELL_API_KEY", "test-api-key");
      fetchMock.mockResolvedValueOnce(new Response("{}", { status: 402 }));
      const collection = await request();
      expect(collection.providerRequestId).not.toBeNull();
      const failed = (await messages())[0]!;
      expect(failed).toMatchObject({ status: "FAILED", note: "provider_refused" });

      fetchMock.mockResolvedValueOnce(accepted());
      const retry = await messageParent({
        businessId: a.businessId,
        collectionId: collection.id,
        kind: "PAYMENT_REQUEST",
        dedupeKey: `request:${collection.id}`,
        sentByUserId: a.userId,
      });
      expect(retry).toMatchObject({ created: true, message: { id: failed.id, status: "SENT", note: null } });
      expect(await db().message.count()).toBe(1);
    });

    it("never delivers the demo account's messages, even with Clickatell configured", async () => {
      vi.stubEnv("CLICKATELL_API_KEY", "test-api-key");
      vi.stubEnv("DEMO_PHONE", "082 000 0001");
      vi.stubEnv("DEMO_OTP", "123456");
      await request();

      expect(await messages()).toEqual([expect.objectContaining({ status: "NOT_DELIVERED", note: "demo_account", provider: null })]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(devOutbox()).toHaveLength(0);
    });

    it("writes in the parent's language", async () => {
      await db().payer.update({ where: { id: payerId }, data: { language: "zu" } });
      await request();
      const message = (await messages())[0]!;
      expect(message.language).toBe("zu");
      expect(message.body).toContain("I-Thusa ayisoze yakucela i-PIN");
    });
  });

  describe("reminders", () => {
    it("reminds about a fee that's due, once a day and at most three times", async () => {
      const collection = await request();
      const first = await sendReminder(a, collection.id, now);
      expect(first).toMatchObject({ kind: "REMINDER", template: "payment_reminder", dedupeKey: `reminder:${collection.id}:2026-10-23` });
      expect(first.body).toContain("A friendly reminder from Sunshine Crèche");

      await expect(sendReminder(a, collection.id, now)).rejects.toMatchObject({ status: 429 });
      await sendReminder(a, collection.id, day("2026-10-24"));
      await sendReminder(a, collection.id, day("2026-10-25"));
      await expect(sendReminder(a, collection.id, day("2026-10-26"))).rejects.toMatchObject({ status: 429 });
      expect(await db().message.count({ where: { kind: "REMINDER" } })).toBe(MAX_REMINDERS);
      expect(await db().auditLog.count({ where: { action: "collection.reminded" } })).toBe(MAX_REMINDERS);

      const [row] = await listCollectionRows(a.businessId, 2026, 10, day("2026-10-25"));
      expect(row).toMatchObject({ remindersSent: 3, remindedToday: true });
    });

    it("won't remind before the fee is due, before it's requested, or once it's paid", async () => {
      const early = await request("2026-10-30");
      await expect(sendReminder(a, early.id, now)).rejects.toMatchObject({ status: 409 });

      const unsent = await db().collection.update({ where: { id: early.id }, data: { providerRequestId: null } });
      await expect(sendReminder(a, unsent.id, day("2026-10-30"))).rejects.toMatchObject({ status: 409 });

      const paid = await request();
      await pay(paid, 30_000);
      await expect(sendReminder(a, paid.id, now)).rejects.toMatchObject({ status: 409 });
      expect(await db().message.count({ where: { kind: "REMINDER" } })).toBe(0);
    });

    it("won't let another business remind (or see) a parent's fee, or remind an archived parent", async () => {
      const collection = await request();
      await expect(sendReminder(b, collection.id, now)).rejects.toMatchObject({ status: 404 });
      expect(await listMessages(b.businessId)).toEqual([]);
      expect(await listMessages(a.businessId)).toHaveLength(1);

      await archivePayer(a, payerId);
      await expect(sendReminder(a, collection.id, now)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("part-payments", () => {
    it("requests the balance of a part-paid fee, and paying it marks the fee PAID in the ledger", async () => {
      const collection = await request();
      await pay(collection, 10_000);
      expect(await db().collection.findUniqueOrThrow({ where: { id: collection.id } })).toMatchObject({ status: "PARTIAL", paidCents: 10_000 });

      // A reminder about a part-paid fee needs the balance link first.
      await expect(sendReminder(a, collection.id, now)).rejects.toMatchObject({ status: 409 });

      const { balanceRequest, sent } = await requestBalance(a, collection.id);
      expect(sent).toBe(true);
      expect(balanceRequest).toMatchObject({ businessId: a.businessId, amountCents: 20_000, forPaidCents: 10_000 });
      expect(balanceRequest.reference).not.toBe(collection.reference);
      expect(balanceRequest.providerRequestId).not.toBeNull();
      const message = (await messages("BALANCE_REQUEST"))[0]!;
      expect(message.body).toContain("thank you for paying R100.00 for Lerato. The balance is R200.00.");
      expect(message.body).toContain(balanceRequest.reference);

      // Asking again returns the same request and sends nothing new.
      expect(await requestBalance(a, collection.id)).toMatchObject({ sent: false, balanceRequest: { id: balanceRequest.id } });
      expect(await db().message.count({ where: { kind: "BALANCE_REQUEST" } })).toBe(1);

      const [row] = await listCollectionRows(a.businessId, 2026, 10, now);
      expect(row).toMatchObject({ status: "PARTIAL", balanceRequested: true });

      // Now the reminder is about the balance.
      const reminder = await sendReminder(a, collection.id, now);
      expect(reminder.body).toContain("fees of R200.00");
      expect(reminder.body).toContain(balanceRequest.reference);

      expect(await pay(balanceRequest, 20_000)).toMatchObject({ status: 200, body: { outcome: "processed" } });
      expect(await db().collection.findUniqueOrThrow({ where: { id: collection.id } })).toMatchObject({ status: "PAID", paidCents: 30_000 });
      const entries = await db().ledgerEntry.findMany({ orderBy: { createdAt: "asc" } });
      expect(entries.map((e) => e.amountCents)).toEqual([10_000, 20_000]);
      expect(entries.every((e) => e.collectionId === collection.id && e.businessId === a.businessId)).toBe(true);
      const paid = await db().auditLog.findFirstOrThrow({ where: { action: "collection.paid", metadata: { path: ["balanceRequestId"], equals: balanceRequest.id } } });
      expect(paid.businessId).toBe(a.businessId);
    });

    it("asks again for a new balance after a second part-payment", async () => {
      const collection = await request();
      await pay(collection, 10_000);
      const first = (await requestBalance(a, collection.id)).balanceRequest;
      await pay(first, 5_000);
      const second = (await requestBalance(a, collection.id)).balanceRequest;
      expect(second).toMatchObject({ amountCents: 15_000, forPaidCents: 15_000 });
      expect(second.id).not.toBe(first.id);
    });

    it("won't credit a balance payment whose reference isn't the balance request's", async () => {
      const collection = await request();
      await pay(collection, 10_000);
      const { balanceRequest } = await requestBalance(a, collection.id);
      const result = await pay({ ...balanceRequest, reference: collection.reference }, 20_000);
      expect(result).toMatchObject({ status: 200, body: { outcome: "mismatch" } });
      expect(await db().collection.findUniqueOrThrow({ where: { id: collection.id } })).toMatchObject({ status: "PARTIAL", paidCents: 10_000 });
    });

    it("only requests a balance for a part-paid fee, and only for its own business", async () => {
      const collection = await request();
      await expect(requestBalance(a, collection.id)).rejects.toMatchObject({ status: 409 });
      await pay(collection, 10_000);
      await expect(requestBalance(b, collection.id)).rejects.toMatchObject({ status: 404 });
      expect(await db().balanceRequest.count()).toBe(0);
    });
  });

  describe("daily job", () => {
    it("sends payday requests across businesses, and a second run the same day sends nothing new", async () => {
      const otherPayer = (await createPayer(b, { ...input, parentName: "Sipho Dube" })).id;
      const run = await runDailyJobs(now);
      expect(run).toMatchObject({ requests: 2, reminders: 0, balances: 0, failed: 0, capped: false });

      const collections = await db().collection.findMany({ orderBy: { businessId: "asc" } });
      expect(collections.map((c) => [c.businessId, c.payerId, c.requestedByUserId])).toEqual(
        expect.arrayContaining([
          [a.businessId, payerId, null],
          [b.businessId, otherPayer, null],
        ]),
      );
      expect(await db().message.count({ where: { kind: "PAYMENT_REQUEST", sentByUserId: null } })).toBe(2);

      expect(await runDailyJobs(now)).toMatchObject({ requests: 0, skipped: 2 });
      expect(await db().message.count()).toBe(2);
    });

    it("reminds 2 and 7 days after an unpaid due date, and asks for the balance of a part-paid one", async () => {
      const unpaid = await request("2026-10-16", day("2026-10-16"));
      const partPaid = await request("2026-10-23");
      await pay(partPaid, 10_000);

      // 23 Oct is 7 days after the 16th: a reminder. It's also payday, but both requests exist already.
      expect(await runDailyJobs(now)).toMatchObject({ requests: 0, reminders: 1, balances: 0 });
      // 25 Oct is 2 days after the 23rd: the part-paid fee gets its balance requested.
      expect(await runDailyJobs(day("2026-10-25"))).toMatchObject({ reminders: 0, balances: 1 });

      expect((await messages("REMINDER")).map((m) => m.collectionId)).toEqual([unpaid.id]);
      expect((await messages("BALANCE_REQUEST")).map((m) => m.collectionId)).toEqual([partPaid.id]);
      expect((await messages("REMINDER"))[0]!.sentByUserId).toBeNull();
    });

    it("leaves archived parents alone", async () => {
      await archivePayer(a, payerId);
      expect(await runDailyJobs(now)).toMatchObject({ requests: 0, reminders: 0 });
      expect(await db().collection.count()).toBe(0);
    });
  });
});
