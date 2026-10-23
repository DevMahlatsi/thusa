// Runs against a real, migrated Postgres. Set TEST_DATABASE_URL to enable:
//   TEST_DATABASE_URL=postgresql://... npx prisma migrate deploy && npm test
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: OTP login, sessions and tenant isolation", async () => {
  const { db } = await import("@/lib/db");
  const { requestOtp, verifyOtp, OTP_MAX_ATTEMPTS } = await import("@/lib/auth/otp");
  const { createSession, findSessionUser, revokeSession } = await import("@/lib/auth/session");
  const { createBusinessForUser, getBusiness, updateBusiness } = await import("@/lib/business");
  const { devOutbox } = await import("@/messaging/adapter");

  const phoneA = "+27820000001";
  const phoneB = "+27820000002";
  const profile = { name: "Crèche A", town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;

  const latestCode = () => devOutbox()[0]?.body.match(/\d{6}/)?.[0] ?? "";

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    devOutbox().splice(0);
    await db().auditLog.deleteMany();
    await db().session.deleteMany();
    await db().user.deleteMany();
    await db().business.deleteMany();
    await db().otpChallenge.deleteMany();
  });

  it("logs in with the right code, once only, and never stores the code", async () => {
    await requestOtp(phoneA, "10.0.0.1");
    const code = latestCode();
    expect(code).toMatch(/^\d{6}$/);
    const stored = await db().otpChallenge.findFirstOrThrow({ where: { phoneE164: phoneA } });
    expect(stored.codeHash).not.toContain(code);

    const user = await verifyOtp(phoneA, code);
    expect(user.phoneE164).toBe(phoneA);
    expect(user.businessId).toBeNull();
    await expect(verifyOtp(phoneA, code)).rejects.toMatchObject({ status: 400 });
  });

  it("locks the code after 3 wrong attempts, even if the 4th is right", async () => {
    await requestOtp(phoneA, "10.0.0.1");
    const code = latestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await expect(verifyOtp(phoneA, wrong)).rejects.toBeDefined();
    await expect(verifyOtp(phoneA, code)).rejects.toMatchObject({ status: 429 });
  });

  it("rejects expired codes", async () => {
    await requestOtp(phoneA, "10.0.0.1");
    const code = latestCode();
    await db().otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(verifyOtp(phoneA, code)).rejects.toMatchObject({ status: 400 });
  });

  it("rate-limits repeated code requests", async () => {
    await requestOtp(phoneA, "10.0.0.1");
    await expect(requestOtp(phoneA, "10.0.0.1")).rejects.toMatchObject({ status: 429 });
  });

  describe("judges' demo login", () => {
    const demoPhone = "+27600000000";

    beforeEach(() => {
      process.env.DEMO_PHONE = "060 000 0000";
      process.env.DEMO_OTP = "123456";
    });
    afterEach(() => {
      delete process.env.DEMO_PHONE;
      delete process.env.DEMO_OTP;
    });

    it("gives the demo number the fixed code, sends no SMS and allows it once", async () => {
      await requestOtp(demoPhone, "10.0.0.1");
      expect(devOutbox()).toHaveLength(0);
      expect((await verifyOtp(demoPhone, "123456")).phoneE164).toBe(demoPhone);
      await expect(verifyOtp(demoPhone, "123456")).rejects.toMatchObject({ status: 400 });
    });

    it("lets several judges request codes back to back", async () => {
      await requestOtp(demoPhone, "10.0.0.1");
      await requestOtp(demoPhone, "10.0.0.2");
      await requestOtp(demoPhone, "10.0.0.3");
      await requestOtp(demoPhone, "10.0.0.4");
      expect((await verifyOtp(demoPhone, "123456")).phoneE164).toBe(demoPhone);
    });

    it("never accepts the fixed code for any other number", async () => {
      await requestOtp(phoneA, "10.0.0.1");
      expect(latestCode()).toMatch(/^\d{6}$/);
      if (latestCode() !== "123456") {
        await expect(verifyOtp(phoneA, "123456")).rejects.toMatchObject({ status: 400 });
      }
    });

    it("is off when the variables are removed", async () => {
      delete process.env.DEMO_PHONE;
      delete process.env.DEMO_OTP;
      await requestOtp(demoPhone, "10.0.0.1");
      expect(devOutbox()).toHaveLength(1);
      const code = latestCode();
      if (code !== "123456") {
        await expect(verifyOtp(demoPhone, "123456")).rejects.toMatchObject({ status: 400 });
      }
    });
  });

  it("revoked sessions stop working", async () => {
    const user = await db().user.create({ data: { phoneE164: phoneA } });
    const { token } = await createSession(user.id);
    expect((await findSessionUser(token))?.user.id).toBe(user.id);
    await revokeSession(token);
    expect(await findSessionUser(token)).toBeNull();
  });

  it("one owner cannot read or change another owner's business", async () => {
    const userA = await db().user.create({ data: { phoneE164: phoneA } });
    const userB = await db().user.create({ data: { phoneE164: phoneB } });
    const bizA = await createBusinessForUser(userA.id, profile);
    const bizB = await createBusinessForUser(userB.id, { ...profile, name: "Crèche B" });

    // The business context always comes from the session user, never the request.
    const sessionA = await db().user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(sessionA.businessId).toBe(bizA.id);
    expect(sessionA.role).toBe("OWNER");

    await updateBusiness({ userId: userA.id, businessId: sessionA.businessId! }, { ...profile, name: "Renamed A" });
    expect((await getBusiness(bizA.id))?.name).toBe("Renamed A");
    expect((await getBusiness(bizB.id))?.name).toBe("Crèche B");
  });

  it("a user can only create one business", async () => {
    const user = await db().user.create({ data: { phoneE164: phoneA } });
    await createBusinessForUser(user.id, profile);
    await expect(createBusinessForUser(user.id, profile)).rejects.toMatchObject({ status: 409 });
    expect(await db().business.count()).toBe(1);
  });
});
