// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: payers, schedules and tenant isolation", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { archivePayer, createPayer, getPayer, listPayers, payerInputSchema, payerPhone, toPayerDto, updatePayer } =
    await import("@/lib/payers");

  const profile = { town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;
  const input = payerInputSchema.parse({
    parentName: "Thandi Mokoena",
    childName: "Lerato",
    phone: "082 123 4567",
    schedule: { amountCents: 12_500, rhythm: "WEEKLY", payday: 5, startsOn: "2026-11-02" },
  });

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };

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
    // The ledger refuses DELETE (append-only); TRUNCATE is how tests clear it.
    await db().$executeRaw`TRUNCATE "LedgerEntry", "WebhookEvent"`;
    await db().collection.deleteMany();
    await db().schedule.deleteMany();
    await db().payer.deleteMany();
    await db().session.deleteMany();
    await db().user.deleteMany();
    await db().business.deleteMany();
    a = await owner("+27820000001", "Crèche A");
    b = await owner("+27820000002", "Crèche B");
  });

  it("creates a payer with a schedule, and stores the phone encrypted", async () => {
    const payer = await createPayer(a, input);
    expect(payer.schedule).toMatchObject({ businessId: a.businessId, amountCents: 12_500, rhythm: "WEEKLY", payday: 5 });

    const raw = await db().payer.findUniqueOrThrow({ where: { id: payer.id } });
    expect(raw.phoneEncrypted).not.toContain("821234567");
    expect(payerPhone(raw)).toBe("+27821234567");
    expect(toPayerDto(payer)).toMatchObject({ phoneMasked: "••••4567", schedule: { startsOn: "2026-11-02" } });

    const log = await db().auditLog.findFirstOrThrow({ where: { action: "payer.created" } });
    expect(JSON.stringify(log.metadata)).not.toContain("4567");
  });

  it("never shows one business's payers to another", async () => {
    const payer = await createPayer(a, input);
    await createPayer(b, { ...input, childName: "Sipho" });

    expect((await listPayers(a.businessId)).map((p) => p.childName)).toEqual(["Lerato"]);
    expect((await listPayers(b.businessId)).map((p) => p.childName)).toEqual(["Sipho"]);
    expect(await getPayer(b.businessId, payer.id)).toBeNull();
  });

  it("never lets one business change or archive another's payer", async () => {
    const payer = await createPayer(a, input);
    const hijack = { ...input, childName: "Hijacked", schedule: { ...input.schedule, amountCents: 1 } };

    await expect(updatePayer(b, payer.id, hijack)).rejects.toMatchObject({ status: 404 });
    await expect(archivePayer(b, payer.id)).rejects.toMatchObject({ status: 404 });

    const after = await getPayer(a.businessId, payer.id);
    expect(after).toMatchObject({ childName: "Lerato", archivedAt: null, schedule: { amountCents: 12_500 } });
    expect(await db().schedule.count({ where: { businessId: b.businessId } })).toBe(0);
  });

  it("updates the payer and schedule together", async () => {
    const payer = await createPayer(a, input);
    const updated = await updatePayer(a, payer.id, {
      ...input,
      phone: "+27831112222",
      schedule: { amountCents: 50_000, rhythm: "MONTHLY", payday: 25, startsOn: "2026-11-01" },
    });
    expect(updated.schedule).toMatchObject({ amountCents: 50_000, rhythm: "MONTHLY", payday: 25 });
    expect(payerPhone(updated)).toBe("+27831112222");
    expect(await db().schedule.count()).toBe(1);
  });

  it("keeps the stored phone when an update leaves it out", async () => {
    const payer = await createPayer(a, input);
    const updated = await updatePayer(a, payer.id, { ...input, phone: undefined, childName: "Lerato M" });
    expect(updated.childName).toBe("Lerato M");
    expect(payerPhone(updated)).toBe("+27821234567");
    const log = await db().auditLog.findFirstOrThrow({ where: { action: "payer.updated" } });
    expect(log.metadata).toEqual({ payerId: payer.id, phoneChanged: false });
  });

  it("won't edit an archived payer", async () => {
    const payer = await createPayer(a, input);
    await archivePayer(a, payer.id);
    await expect(updatePayer(a, payer.id, input)).rejects.toMatchObject({ status: 404 });
  });

  it("archives instead of deleting", async () => {
    const payer = await createPayer(a, input);
    await archivePayer(a, payer.id);
    expect(await listPayers(a.businessId)).toEqual([]);
    expect((await getPayer(a.businessId, payer.id))?.archivedAt).not.toBeNull();
    await expect(archivePayer(a, payer.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a phone ciphertext copied into another business's payer", async () => {
    const payer = await createPayer(a, input);
    const copy = await createPayer(b, input);
    const moved = await db().payer.update({ where: { id: copy.id }, data: { phoneEncrypted: payer.phoneEncrypted } });
    expect(() => payerPhone(moved)).toThrow();
  });

  describe("database backstops", () => {
    it("won't link a schedule to another business's payer", async () => {
      const payer = await createPayer(a, input);
      await db().schedule.deleteMany();
      await expect(
        db().schedule.create({
          data: { payerId: payer.id, businessId: b.businessId, amountCents: 100, rhythm: "WEEKLY", payday: 1, startsOn: new Date() },
        }),
      ).rejects.toThrow();
    });

    it.each([
      [{ amountCents: 0 }],
      [{ amountCents: -500 }],
      [{ rhythm: "WEEKLY" as const, payday: 8 }],
      [{ rhythm: "MONTHLY" as const, payday: 32 }],
    ])("rejects bad schedule values even without Zod %#", async (change) => {
      const payer = await createPayer(a, input);
      await expect(
        db().schedule.update({ where: { payerId_businessId: { payerId: payer.id, businessId: a.businessId } }, data: change }),
      ).rejects.toThrow();
    });

    it("allows only one schedule per payer", async () => {
      const payer = await createPayer(a, input);
      await expect(
        db().schedule.create({
          data: { payerId: payer.id, businessId: a.businessId, amountCents: 100, rhythm: "WEEKLY", payday: 1, startsOn: new Date() },
        }),
      ).rejects.toThrow();
    });
  });
});
