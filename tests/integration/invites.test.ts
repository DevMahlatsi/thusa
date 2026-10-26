// Runs against a real, migrated Postgres. See auth-and-business.test.ts for how to enable.
// Parent self-onboarding: single-use, expiring links; answers that wait for the owner's approval (nothing is
// sent before it); amounts only ever from the owner's fee; one business never touching another's invites.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration: parent invites", async () => {
  const { db } = await import("@/lib/db");
  const { createBusinessForUser } = await import("@/lib/business");
  const { listPayers, payerPhone } = await import("@/lib/payers");
  const { runDailyJobs } = await import("@/jobs/daily");
  const { pruneRateLimitHits } = await import("@/lib/rate-limit");
  const { splitMonthlyFee } = await import("@/lib/fee-split");
  const invites = await import("@/lib/invites");
  const {
    approveInvite,
    assertJoinAllowed,
    cancelInvite,
    consentText,
    createInvite,
    declineInvite,
    findInviteForJoin,
    getInvite,
    inviteShare,
    joinInputSchema,
    JOIN_LIMITS,
    listPendingInvites,
    submitInvite,
    toInviteDto,
  } = invites;

  const profile = { town: null, province: "GP", ecdRegistrationNumber: null, defaultLanguage: "en" } as const;
  // Monday 26 October 2026; the parent's payday is Friday the 30th.
  const now = new Date("2026-10-26T10:00:00+02:00");
  const friday = new Date("2026-10-30T08:00:00+02:00");
  // What the owner gives: the parent's number (already normalised, as the schema hands it on), child and fees.
  const fee = { phone: "+27821234567", childName: "Lerato", monthlyAmountCents: 120_000, parentAgreed: true } as const;
  const parentAnswers = { parentName: "Thandi Mokoena", rhythm: "WEEKLY", payday: 5, language: "zu", consent: true };

  let a: { userId: string; businessId: string };
  let b: { userId: string; businessId: string };

  async function owner(phoneE164: string, name: string) {
    const user = await db().user.create({ data: { phoneE164 } });
    const business = await createBusinessForUser(user.id, { ...profile, name });
    return { userId: user.id, businessId: business.id };
  }

  /** An invite for `ctx`, and the secret from its link, as the parent would get it. */
  async function invite(ctx = a, at = now, input: Parameters<typeof createInvite>[1] = fee) {
    const row = await createInvite(ctx, input, at);
    const { link } = inviteShare({ ...row, consent: null }, "Crèche", "https://mythusa.vercel.app");
    return { id: row.id, token: link.split("/join/")[1]! };
  }

  const answers = (token: string, change: Record<string, unknown> = {}) => joinInputSchema.parse({ token, ...parentAnswers, ...change });

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
    await db().rateLimitHit.deleteMany();
    a = await owner("+27820000001", "Crèche A");
    b = await owner("+27820000002", "Crèche B");
  });

  it("keeps the parent's answers waiting: no payer and nothing sent until the owner approves", async () => {
    const { id, token } = await invite();
    expect(await findInviteForJoin(token, now)).toMatchObject({
      state: "OPEN",
      businessName: "Crèche A",
      childName: "Lerato",
      phoneMasked: "••••4567",
      options: [
        { rhythm: "MONTHLY", amountCents: 120_000 },
        { rhythm: "FORTNIGHTLY", amountCents: 55_385 },
        { rhythm: "WEEKLY", amountCents: 27_692 },
      ],
    });

    expect(await submitInvite(answers(token), now)).toEqual({ businessName: "Crèche A" });
    const row = await db().payerInvite.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "SUBMITTED", businessId: a.businessId, rhythm: "WEEKLY", payday: 5, amountCents: 27_692, language: "zu" });
    // The number is the one the owner gave, stored encrypted.
    expect(row.phoneEncrypted).not.toContain("821234567");
    expect(payerPhone({ businessId: a.businessId, phoneEncrypted: row.phoneEncrypted! })).toBe("+27821234567");

    // Consent: the exact words, a timestamp and the invite.
    const consent = await db().messagingConsent.findUniqueOrThrow({ where: { inviteId: id } });
    expect(consent).toMatchObject({ businessId: a.businessId, text: consentText("Crèche A"), consentedAt: now });

    // Awaiting approval: not a payer, so the payday run sends nothing.
    expect(toInviteDto((await getInvite(a.businessId, id))!, now)).toMatchObject({ state: "AWAITING_APPROVAL", phoneMasked: "••••4567" });
    expect(await listPayers(a.businessId)).toEqual([]);
    expect(await runDailyJobs(friday)).toMatchObject({ requests: 0 });
    expect(await db().collection.count()).toBe(0);
    expect(await db().message.count()).toBe(0);

    const payer = await approveInvite(a, id, new Date("2026-10-30T07:00:00+02:00"));
    expect(payer).toMatchObject({ businessId: a.businessId, parentName: "Thandi Mokoena", childName: "Lerato", language: "zu" });
    expect(payer.schedule).toMatchObject({ amountCents: 27_692, rhythm: "WEEKLY", payday: 5 });
    expect(payerPhone(payer)).toBe("+27821234567");
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "APPROVED", payerId: payer.id });

    // Approved: the payday run now asks them to pay.
    expect(await runDailyJobs(friday)).toMatchObject({ requests: 1 });
    expect(await db().collection.findFirstOrThrow({ where: { payerId: payer.id } })).toMatchObject({ amountCents: 27_692, businessId: a.businessId });
  });

  it("refuses an expired link, and stores nothing", async () => {
    const { id, token } = await invite(a, new Date(now.getTime() - 8 * 24 * 60 * 60_000));
    expect(await findInviteForJoin(token, now)).toMatchObject({ state: "EXPIRED" });
    await expect(submitInvite(answers(token), now)).rejects.toMatchObject({ status: 410, publicMessage: expect.stringMatching(/expired/) });

    // Exactly at the expiry time it's already closed.
    const edge = await invite(a, now);
    const expiresAt = (await db().payerInvite.findUniqueOrThrow({ where: { id: edge.id } })).expiresAt;
    await expect(submitInvite(answers(edge.token), expiresAt)).rejects.toMatchObject({ status: 410 });

    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "OPEN", parentName: null, rhythm: null });
    expect(await db().messagingConsent.count()).toBe(0);
  });

  it("clears the parent's number from links that expired unused, and only those", async () => {
    const expired = await invite(a, new Date(now.getTime() - 8 * 24 * 60 * 60_000));
    const open = await invite(a, now);
    const used = await invite(a, new Date(now.getTime() - 8 * 24 * 60 * 60_000));
    await submitInvite(answers(used.token), new Date(now.getTime() - 7 * 24 * 60 * 60_000));

    // The daily job's housekeeping.
    await runDailyJobs(now);
    const phone = async (id: string) => (await db().payerInvite.findUniqueOrThrow({ where: { id } })).phoneEncrypted;
    expect(await phone(expired.id)).toBeNull();
    expect(await phone(open.id)).not.toBeNull();
    // Answers waiting for approval keep theirs, whatever the link's expiry.
    expect(await phone(used.id)).not.toBeNull();
    expect(toInviteDto((await getInvite(a.businessId, expired.id))!, now)).toMatchObject({ state: "EXPIRED", phoneMasked: null });
  });

  it("works once: a reused link is refused and the first answers stay", async () => {
    const { id, token } = await invite();
    await submitInvite(answers(token), now);
    await expect(submitInvite(answers(token, { parentName: "Someone Else", rhythm: "MONTHLY", payday: 25 }), now)).rejects.toMatchObject({
      status: 410,
      publicMessage: expect.stringMatching(/already been used/),
    });
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ parentName: "Thandi Mokoena" });
    expect(await db().messagingConsent.count()).toBe(1);
    expect(await findInviteForJoin(token, now)).toMatchObject({ state: "AWAITING_APPROVAL" });

    // Still refused after approval.
    await approveInvite(a, id, now);
    await expect(submitInvite(answers(token), now)).rejects.toMatchObject({ status: 410 });
  });

  it("lets only one of two submissions at once through", async () => {
    const { token } = await invite();
    const results = await Promise.allSettled([
      submitInvite(answers(token, { parentName: "First Parent" }), now),
      submitInvite(answers(token, { parentName: "Second Parent" }), now),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 410 } });
    expect(await db().messagingConsent.count()).toBe(1);
  });

  it("never lets the parent set the amount: the server's split is stored, and the database refuses any other", async () => {
    // A rhythm the invite doesn't offer (every invite offers all three for now; the column allows fewer).
    const { id, token } = await invite();
    await db().payerInvite.update({ where: { id }, data: { allowedRhythms: ["MONTHLY", "WEEKLY"] } });
    await expect(submitInvite(answers(token, { rhythm: "FORTNIGHTLY" }), now)).rejects.toMatchObject({ status: 400 });
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "OPEN", amountCents: null });

    // An amount (or a phone) in the body never gets past the schema.
    expect(joinInputSchema.safeParse({ token, ...parentAnswers, amountCents: 1 }).success).toBe(false);
    expect(joinInputSchema.safeParse({ token, ...parentAnswers, phone: "083 555 0000" }).success).toBe(false);

    await submitInvite(answers(token), now);
    // The CHECKs hold even for a write that skips the app: the amount must be the split, the rhythm allowed.
    await expect(db().payerInvite.update({ where: { id }, data: { amountCents: 1 } })).rejects.toThrow();
    await expect(db().payerInvite.update({ where: { id }, data: { rhythm: "FORTNIGHTLY", amountCents: 55_385 } })).rejects.toThrow();
    await expect(db().payerInvite.update({ where: { id }, data: { monthlyAmountCents: 1_000 } })).rejects.toThrow();
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ amountCents: 27_692, monthlyAmountCents: 120_000 });

    // And the database's sum agrees with the app's for awkward fees, both ways of splitting.
    for (const monthlyAmountCents of [101, 35_000, 50_950, 777_777, 10_000_000]) {
      for (const rhythm of ["WEEKLY", "FORTNIGHTLY"] as const) {
        const next = await invite(a, now, { ...fee, childName: "Test", monthlyAmountCents });
        await submitInvite(answers(next.token, { rhythm }), now);
        const stored = await db().payerInvite.findUniqueOrThrow({ where: { id: next.id } });
        expect(stored.amountCents).toBe(splitMonthlyFee(monthlyAmountCents, rhythm));
      }
    }
  });

  it("never shows or changes one business's invites for another", async () => {
    const { id, token } = await invite(a);
    await submitInvite(answers(token), now);

    expect(await getInvite(b.businessId, id)).toBeNull();
    expect(await listPendingInvites(b.businessId, now)).toEqual([]);
    expect((await listPendingInvites(a.businessId, now)).map((i) => i.id)).toEqual([id]);
    await expect(approveInvite(b, id, now)).rejects.toMatchObject({ status: 404 });
    await expect(declineInvite(b, id, now)).rejects.toMatchObject({ status: 404 });
    await expect(cancelInvite(b, id, now)).rejects.toMatchObject({ status: 404 });
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUBMITTED" });
    expect(await db().payer.count()).toBe(0);

    // The phone is bound to A: it can't be read as B's.
    const row = await db().payerInvite.findUniqueOrThrow({ where: { id } });
    expect(() => payerPhone({ businessId: b.businessId, phoneEncrypted: row.phoneEncrypted! })).toThrow();

    // Approved by A, the parent is A's only.
    const payer = await approveInvite(a, id, now);
    expect(payer.businessId).toBe(a.businessId);
    expect(await listPayers(b.businessId)).toEqual([]);
    expect((await listPayers(a.businessId)).map((p) => p.id)).toEqual([payer.id]);
  });

  it("declining clears the parent's name and phone, keeps the consent, and creates no payer", async () => {
    const { id, token } = await invite();
    await submitInvite(answers(token), now);
    await declineInvite(a, id, now);

    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DECLINED",
      parentName: null,
      phoneEncrypted: null,
      decidedByUserId: a.userId,
    });
    await expect(approveInvite(a, id, now)).rejects.toMatchObject({ status: 409 });
    expect(await db().payer.count()).toBe(0);

    // Consent is evidence: it can't be changed or removed.
    expect(await db().messagingConsent.count({ where: { inviteId: id } })).toBe(1);
    await expect(db().messagingConsent.deleteMany({ where: { inviteId: id } })).rejects.toThrow(/append-only/);
    await expect(db().messagingConsent.updateMany({ where: { inviteId: id }, data: { text: "changed" } })).rejects.toThrow(/append-only/);
  });

  it("cancelling an open link stops it working", async () => {
    const { id, token } = await invite();
    await cancelInvite(a, id, now);
    expect(await db().payerInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "CANCELLED", phoneEncrypted: null });
    await expect(submitInvite(answers(token), now)).rejects.toMatchObject({ status: 410, publicMessage: expect.stringMatching(/no longer valid/) });
    await expect(cancelInvite(a, id, now)).rejects.toMatchObject({ status: 409 });

    // A used link can't be cancelled (decline it instead).
    const used = await invite();
    await submitInvite(answers(used.token), now);
    await expect(cancelInvite(a, used.id, now)).rejects.toMatchObject({ status: 409 });
  });

  it("approves once, even when two approvals race", async () => {
    const { id, token } = await invite();
    await submitInvite(answers(token), now);
    const results = await Promise.allSettled([approveInvite(a, id, now), approveInvite(a, id, now)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().payer.count()).toBe(1);
    expect(await db().schedule.count()).toBe(1);
  });

  it("rate-limits the public endpoint per IP, storing only a keyed hash of it", async () => {
    for (let i = 0; i < JOIN_LIMITS.perIpHour; i++) await assertJoinAllowed("203.0.113.9", now);
    await expect(assertJoinAllowed("203.0.113.9", now)).rejects.toMatchObject({ status: 429 });
    // Another IP has its own allowance, and the window moves on.
    await assertJoinAllowed("198.51.100.4", now);
    await assertJoinAllowed("203.0.113.9", new Date(now.getTime() + 60 * 60_000 + 1));

    const rows = await db().rateLimitHit.findMany();
    expect(rows.every((r) => r.bucket === "join" && /^[0-9a-f]{64}$/.test(r.keyHash))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("203.0.113");

    // The daily job's housekeeping clears rows older than two days.
    expect(await pruneRateLimitHits(new Date(now.getTime() + 3 * 24 * 60 * 60_000))).toBe(rows.length);
  });

  it("keeps personal data out of the audit log", async () => {
    const { id, token } = await invite();
    await submitInvite(answers(token), now);
    await approveInvite(a, id, now);
    const logs = await db().auditLog.findMany({ where: { action: { startsWith: "invite." } } });
    expect(logs.map((l) => l.action).sort()).toEqual(["invite.approved", "invite.created", "invite.submitted"]);
    // The owner's confirmation that the parent agreed to their number being given.
    expect(logs.find((l) => l.action === "invite.created")?.metadata).toEqual({ inviteId: id, parentAgreed: true });
    expect(JSON.stringify(logs)).not.toMatch(/4567|Thandi|Lerato/);
  });
});
