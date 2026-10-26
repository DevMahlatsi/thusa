// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// WhatsApp for parents' messages (which channel, the demo guard, failures) and the demo's "Send to my
// WhatsApp" (limits, tenant isolation). Meta and Clickatell are reached through a stubbed fetch, never the
// network. Payments use the mock provider, given a Stitch-style payment page so the button has an id.
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: WhatsApp messages and the demo sample", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { createPayer, payerInputSchema } = await import("@/lib/payers");
  const { requestCollection } = await import("@/lib/collections");
  const { messageParent } = await import("@/lib/parent-messages");
  const { getWhatsAppSample, sendWhatsAppSample, SAMPLE_LIMITS } = await import("@/lib/whatsapp-sample");
  const { devOutbox } = await import("@/messaging/adapter");
  const { mockProvider } = await import("@/payments/mock");

  const profile = { town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;
  // Weekly on Fridays: due 2, 9, 16, 23 and 30 October 2026.
  const input = payerInputSchema.parse({
    parentName: "Thandi Mokoena",
    childName: "Lerato",
    phone: "082 123 4567",
    schedule: { amountCents: 30_000, rhythm: "WEEKLY", payday: 5, startsOn: "2026-10-01" },
  });
  const now = new Date("2026-10-23T10:00:00+02:00");
  const JUDGE = "+27831112222";
  const IP = "198.51.100.7";

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };
  let payerId: string;

  const fetchMock = vi.fn<typeof fetch>();
  const metaAccepted = () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 });
  const metaUrl = "https://graph.facebook.com/v23.0/123456789012/messages";
  const metaCalls = () => fetchMock.mock.calls.filter(([url]) => url === metaUrl);
  const sentTo = (i = 0) => JSON.parse(metaCalls()[i]![1]?.body as string);

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }

  const request = async (dueDate = "2026-10-23") => (await requestCollection(a, { payerId, dueDate }, now)).collection;
  const messages = () => db().message.findMany({ orderBy: { createdAt: "asc" } });
  // a's owner phone is the demo login, so a is the demo business.
  const makeADemo = () => {
    vi.stubEnv("DEMO_PHONE", "082 000 0001");
    vi.stubEnv("DEMO_OTP", "123456");
  };

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

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
    devOutbox().length = 0;
    a = await owner("+27820000001", "Sunshine Crèche");
    b = await owner("+27820000002", "Crèche B");
    payerId = (await createPayer(a, input)).id;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789012");
    // Mock requests get a payment page like Stitch's, each with its own id.
    vi.spyOn(mockProvider, "createPaymentRequest").mockImplementation(async () => {
      const id = randomUUID().replace(/-/g, "").slice(0, 22);
      return { providerRequestId: `mock_${id}`, paymentUrl: `https://express.stitch.money/pay/${id}` };
    });
    fetchMock.mockImplementation(async () => metaAccepted());
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("parents' messages", () => {
    it("sends an English parent's payment request on WhatsApp and records it word for word", async () => {
      const collection = await request();
      const [message] = await messages();
      const pageId = collection.paymentUrl!.split("/").pop();

      expect(message).toMatchObject({
        channel: "whatsapp",
        template: "payment_request",
        language: "en",
        phoneMasked: "••••4567",
        status: "SENT",
        provider: "meta",
        note: null,
      });
      expect(message!.providerMessageId).toMatch(/^wamid\./);
      expect(message!.body).toBe(
        `Hello from Sunshine Crèche. Lerato's fees of R300.00 are due on 23/10/2026. Your reference is ${collection.reference}. Tap Pay now to pay.\n\n` +
          `Thusa will never ask for your PIN or password.\n\n[Pay now] https://express.stitch.money/pay/${pageId}`,
      );
      expect(sentTo()).toMatchObject({
        to: "27821234567",
        template: { name: "thusa_payment_request_v1", language: { code: "en" } },
      });
      expect(sentTo().template.components[1].parameters).toEqual([{ type: "text", text: pageId }]);
      expect(devOutbox()).toHaveLength(0);
    });

    it("sends isiZulu parents the isiZulu template", async () => {
      await db().payer.update({ where: { id: payerId }, data: { language: "zu" } });
      await request();
      const [message] = await messages();
      expect(message).toMatchObject({ channel: "whatsapp", language: "zu", status: "SENT" });
      expect(message!.body).toContain("I-Thusa ayisoze yakucela i-PIN");
      expect(sentTo().template.language).toEqual({ code: "zu" });
    });

    it("sends Sesotho by SMS when SMS is on, and only records it when SMS is off", async () => {
      await db().payer.update({ where: { id: payerId }, data: { language: "st" } });
      vi.stubEnv("CLICKATELL_API_KEY", "test-api-key");
      fetchMock.mockImplementation(async () =>
        new Response(JSON.stringify({ messages: [{ apiMessageId: "ct-1", accepted: true }] }), { status: 202 }),
      );
      const collection = await request();
      expect((await messages())[0]).toMatchObject({ channel: "sms", language: "st", status: "SENT", provider: "clickatell" });
      expect(metaCalls()).toHaveLength(0);

      // In production with no Clickatell key there's no SMS at all.
      vi.stubEnv("CLICKATELL_API_KEY", "");
      vi.stubEnv("NODE_ENV", "production");
      const { message } = await messageParent({
        businessId: a.businessId,
        collectionId: collection.id,
        kind: "PAYMENT_REQUEST",
        dedupeKey: "test:st",
        sentByUserId: a.userId,
      });
      expect(message).toMatchObject({ channel: "sms", status: "NOT_DELIVERED", note: "whatsapp_language", provider: null });
    });

    it("falls back to SMS for a fee with no payment page (the button needs one)", async () => {
      vi.mocked(mockProvider.createPaymentRequest).mockImplementation(async () => ({ providerRequestId: `mock_${randomUUID()}`, paymentUrl: null }));
      await request();
      expect((await messages())[0]).toMatchObject({ channel: "sms", status: "NOT_DELIVERED", note: "dev_outbox" });
      expect(metaCalls()).toHaveLength(0);
    });

    it("never delivers the demo account's messages on WhatsApp either", async () => {
      makeADemo();
      await request();
      expect(await messages()).toEqual([
        expect.objectContaining({ channel: "whatsapp", status: "NOT_DELIVERED", note: "demo_account", provider: null }),
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the request when Meta refuses the message, and a retry under the same key sends it", async () => {
      fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 132001 } }), { status: 400 }));
      const collection = await request();
      expect(collection.providerRequestId).not.toBeNull();
      const [failed] = await messages();
      expect(failed).toMatchObject({ channel: "whatsapp", status: "FAILED", note: "provider_refused", provider: "meta" });

      const retry = await messageParent({
        businessId: a.businessId,
        collectionId: collection.id,
        kind: "PAYMENT_REQUEST",
        dedupeKey: `request:${collection.id}`,
        sentByUserId: a.userId,
      });
      expect(retry).toMatchObject({ created: true, message: { id: failed!.id, status: "SENT", note: null } });
    });
  });

  describe("the demo's Send to my WhatsApp", () => {
    it("sends the fee's payment request to the number typed in, not the parent's, and keeps the number masked", async () => {
      makeADemo();
      const collection = await request();
      const message = await sendWhatsAppSample(a, collection.id, JUDGE, IP, now);

      expect(message).toMatchObject({
        channel: "whatsapp",
        kind: "PAYMENT_REQUEST",
        status: "SENT",
        note: "demo_sample",
        provider: "meta",
        phoneMasked: "••••2222",
        sentByUserId: a.userId,
      });
      expect(message.dedupeKey.startsWith("sample:2026-10-23:")).toBe(true);
      expect(message.dedupeKey).not.toMatch(/831112222|198\.51/);
      expect(metaCalls()).toHaveLength(1);
      expect(sentTo().to).toBe("27831112222");
      expect(await db().auditLog.count({ where: { action: "demo.whatsapp_sample", businessId: a.businessId } })).toBe(1);
      // The demo's own payment request message stays undelivered.
      expect(await db().message.count({ where: { note: "demo_account" } })).toBe(1);
    });

    it("shows the message before it's sent, exactly as it goes out", async () => {
      makeADemo();
      const collection = await request();
      const sample = await getWhatsAppSample(a.businessId, collection.id);
      const message = await sendWhatsAppSample(a, collection.id, JUDGE, IP, now);
      expect(sample).toMatchObject({ parentName: "Thandi Mokoena", problem: null, canSend: true, message: { text: message.body } });
    });

    it("sends a Sesotho parent's fee in English, since WhatsApp has no Sesotho template", async () => {
      makeADemo();
      await db().payer.update({ where: { id: payerId }, data: { language: "st" } });
      const collection = await request();
      const message = await sendWhatsAppSample(a, collection.id, JUDGE, IP, now);
      expect(message).toMatchObject({ language: "en", status: "SENT" });
    });

    it("doesn't exist outside the demo", async () => {
      const collection = await request();
      await expect(sendWhatsAppSample(a, collection.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 404 });
      expect(await getWhatsAppSample(a.businessId, collection.id)).toBeNull();
      // Only the parent's own payment request went out; the typed-in number got nothing.
      expect(metaCalls().map((_, i) => sentTo(i).to)).toEqual(["27821234567"]);
    });

    it("is a preview only with WhatsApp off: the exact message and its real Pay now link, nothing sent", async () => {
      makeADemo();
      vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
      vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
      const collection = await request();
      const sample = await getWhatsAppSample(a.businessId, collection.id);
      expect(sample).toMatchObject({ canSend: false, problem: null });
      expect(sample!.message!.parts.url).toBe(collection.paymentUrl);
      expect(sample!.message!.parts.body).toContain("Hello from Sunshine Crèche.");

      await expect(sendWhatsAppSample(a, collection.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 503 });
      expect(await db().message.count({ where: { note: "demo_sample" } })).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("won't let another business send (or see) the demo's fees", async () => {
      makeADemo();
      const collection = await request();
      // Make b the demo instead: a's fee is then another business's.
      vi.stubEnv("DEMO_PHONE", "082 000 0002");
      await expect(sendWhatsAppSample(b, collection.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 404 });
      expect(await getWhatsAppSample(b.businessId, collection.id)).toBeNull();
      expect(metaCalls()).toHaveLength(0);
    });

    it("only sends unpaid fees that have been requested", async () => {
      makeADemo();
      const unsent = await db().collection.update({ where: { id: (await request()).id }, data: { providerRequestId: null } });
      await expect(sendWhatsAppSample(a, unsent.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 409 });
      const paid = await db().collection.update({
        where: { id: (await request("2026-10-16")).id },
        data: { status: "PAID", paidCents: 30_000, paidAt: now },
      });
      await expect(sendWhatsAppSample(a, paid.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 409 });
      expect((await getWhatsAppSample(a.businessId, paid.id))?.problem).toBe("Pick a fee that hasn't been paid yet.");
      expect(metaCalls()).toHaveLength(0);
    });

    it("sends a fee to a number once a day, and at most a few fees per number and per address", async () => {
      makeADemo();
      const fees = [];
      for (const due of ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"]) fees.push(await request(due));

      await sendWhatsAppSample(a, fees[0]!.id, JUDGE, IP, now);
      await expect(sendWhatsAppSample(a, fees[0]!.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 429 });
      for (const fee of fees.slice(1, SAMPLE_LIMITS.perPhoneDay)) await sendWhatsAppSample(a, fee.id, JUDGE, IP, now);
      await expect(sendWhatsAppSample(a, fees[3]!.id, JUDGE, IP, now)).rejects.toMatchObject({ status: 429 });
      expect(metaCalls()).toHaveLength(SAMPLE_LIMITS.perPhoneDay);

      // Another number is fine; the next day the first number can have another.
      await sendWhatsAppSample(a, fees[3]!.id, "+27831113333", IP, now);
      await sendWhatsAppSample(a, fees[3]!.id, JUDGE, IP, new Date("2026-10-24T09:00:00+02:00"));

      // Per address: the 10th of the day is the last.
      await db().message.deleteMany({ where: { note: "demo_sample" } });
      for (let i = 0; i < SAMPLE_LIMITS.perIpDay; i++) {
        await sendWhatsAppSample(a, fees[i % 4]!.id, `+2783111${String(4000 + i)}`, IP, now);
      }
      await expect(sendWhatsAppSample(a, fees[0]!.id, "+27831119999", IP, now)).rejects.toMatchObject({ status: 429 });
      await sendWhatsAppSample(a, fees[0]!.id, "+27831119999", "203.0.113.9", now);
    });
  });
});
