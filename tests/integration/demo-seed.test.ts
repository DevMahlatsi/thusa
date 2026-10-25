// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// The judges' demo reset: a fresh crèche with history, the old one archived (never deleted), and its
// messages never delivered.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: demo account reset", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { createPayer, payerInputSchema, payerPhone } = await import("@/lib/payers");
  const { listCollectionRows } = await import("@/lib/collections");
  const { isDemoBusiness } = await import("@/lib/parent-messages");
  const { sendReminder } = await import("@/lib/reminders");
  const { runDailyJobs } = await import("@/jobs/daily");
  const { DEMO_PARENTS, resetDemoAccount } = await import("@/lib/demo-seed");

  const DEMO = "+27600000000";
  // Saturday 24 October 2026, 07:00 SA time (the reset runs before the daily job).
  const now = new Date("2026-10-24T07:00:00+02:00");
  const fetchMock = vi.fn<typeof fetch>();

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
    vi.stubEnv("DEMO_PHONE", "060 000 0000");
    vi.stubEnv("DEMO_OTP", "123456");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds a demo crèche with history and points the demo login at it", async () => {
    const summary = (await resetDemoAccount(now))!;
    const user = await db().user.findUniqueOrThrow({ where: { phoneE164: DEMO } });
    expect(user).toMatchObject({ businessId: summary.businessId, role: "OWNER" });
    expect(await isDemoBusiness(summary.businessId)).toBe(true);

    const payers = await db().payer.findMany({ where: { businessId: summary.businessId } });
    expect(payers).toHaveLength(DEMO_PARENTS.length);
    expect(payers.every((p) => payerPhone(p).startsWith("+27000"))).toBe(true);

    // paidCents is always the sum of the ledger, as the webhook keeps it.
    const collections = await db().collection.findMany({ where: { businessId: summary.businessId }, include: { ledgerEntries: true } });
    expect(collections).toHaveLength(summary.fees);
    for (const c of collections) {
      expect(c.paidCents).toBe(c.ledgerEntries.reduce((sum, e) => sum + e.amountCents, 0));
      expect(c.provider).toBe("demo");
      expect(c.status).toBe(c.paidCents >= c.amountCents ? "PAID" : c.paidCents > 0 ? "PARTIAL" : "PENDING");
    }

    const rows = await listCollectionRows(summary.businessId, 2026, 10, now);
    expect(rows.some((r) => r.status === "PAID" && r.paidOnTime)).toBe(true);
    expect(rows.some((r) => r.status === "PARTIAL" && r.balanceRequested)).toBe(true);
    expect(rows.some((r) => r.status === "PENDING" && r.remindersSent > 0)).toBe(true);

    const messages = await db().message.findMany({ where: { businessId: summary.businessId } });
    expect(messages).toHaveLength(summary.messages);
    expect(messages.every((m) => m.status === "NOT_DELIVERED" && m.note === "demo_account")).toBe(true);
    expect(new Set(messages.map((m) => m.kind))).toEqual(new Set(["PAYMENT_REQUEST", "BALANCE_REQUEST", "REMINDER"]));
    expect(messages.find((m) => m.language === "zu")?.body).toContain("I-Thusa ayisoze yakucela i-PIN");
  });

  it("archives the old demo business on the next reset and never deletes its history", async () => {
    const first = (await resetDemoAccount(now))!;
    const ledgerBefore = await db().ledgerEntry.count({ where: { businessId: first.businessId } });
    const second = (await resetDemoAccount(new Date("2026-10-25T07:00:00+02:00")))!;

    expect(second.businessId).not.toBe(first.businessId);
    expect(second.archivedParents).toBe(DEMO_PARENTS.length);
    expect(await db().payer.count({ where: { businessId: first.businessId, archivedAt: null } })).toBe(0);
    expect(await db().ledgerEntry.count({ where: { businessId: first.businessId } })).toBe(ledgerBefore);
    expect(await db().user.findUniqueOrThrow({ where: { phoneE164: DEMO } })).toMatchObject({ businessId: second.businessId });
    expect(await isDemoBusiness(first.businessId)).toBe(false);
    expect(await db().auditLog.count({ where: { action: "demo.reset" } })).toBe(2);
  });

  it("moves a demo login that set up a business by hand, archiving that business's parents", async () => {
    const user = await db().user.create({ data: { phoneE164: DEMO } });
    const old = await createBusinessForUser(user.id, { name: "Judge's crèche", town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" });
    const input = payerInputSchema.parse({ parentName: "Real Person", childName: "Child", phone: "082 123 4567", schedule: { amountCents: 30_000, rhythm: "WEEKLY", payday: 6 } });
    await createPayer({ userId: user.id, businessId: old.id }, input);

    expect((await resetDemoAccount(now))!.archivedParents).toBe(1);
    // Saturday is that parent's payday, but archived parents are left alone by the daily job.
    await runDailyJobs(new Date("2026-10-24T08:00:00+02:00"));
    expect(await db().collection.count({ where: { businessId: old.id } })).toBe(0);
  });

  it("leaves other businesses alone", async () => {
    const other = await db().user.create({ data: { phoneE164: "+27820000002" } });
    const business = await createBusinessForUser(other.id, { name: "Crèche B", town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" });
    await resetDemoAccount(now);
    expect(await db().user.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ businessId: business.id });
    expect(await db().payer.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("never delivers a reminder about a seeded fee, even with Clickatell on", async () => {
    const { businessId } = (await resetDemoAccount(now))!;
    vi.stubEnv("CLICKATELL_API_KEY", "test-api-key");
    const overdue = (await listCollectionRows(businessId, 2026, 10, now)).find((r) => r.status === "PENDING" && r.requested && !r.remindedToday)!;
    const message = await sendReminder({ userId: null, businessId }, overdue.id, now);
    expect(message).toMatchObject({ status: "NOT_DELIVERED", note: "demo_account" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when the demo login is off", async () => {
    vi.stubEnv("DEMO_PHONE", "");
    vi.stubEnv("DEMO_OTP", "");
    expect(await resetDemoAccount(now)).toBeNull();
    expect(await db().business.count()).toBe(0);
  });
});
