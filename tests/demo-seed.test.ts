// The demo crèche's history (src/lib/demo-seed.ts) is worked out from the day it's seeded, so its shape
// is checked for several days: every state a judge should see is there, and nothing is impossible.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_REMINDERS } from "@/lib/reminders";
import { DEMO_INVITES, DEMO_PARENTS, demoInviteRows, demoPhone, demoStartsOn, planDemoFees, type PlannedFee } from "@/lib/demo-seed";
import { splitMonthlyFee } from "@/lib/fee-split";
import { consentText, inviteState } from "@/lib/invites";
import { payerPhone } from "@/lib/payers";
import { buildInsights, firstName } from "@/lib/insights";
import { payerInputSchema } from "@/lib/payers";
import { normaliseSaMobile } from "@/lib/phone";

const DAYS = ["2026-10-24", "2026-10-26", "2026-11-01", "2026-11-17", "2026-12-31", "2027-02-28", "2027-03-01"];

const paid = (f: PlannedFee) => f.payments.reduce((sum, p) => sum + p.amountCents, 0);
const saDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);

describe("demo parents", () => {
  it("have numbers no real SA mobile can have, so the demo can never message a person", () => {
    const phones = DEMO_PARENTS.map((_, i) => demoPhone(i));
    expect(new Set(phones).size).toBe(DEMO_PARENTS.length);
    for (const phone of phones) {
      expect(phone).toMatch(/^\+27000\d{6}$/);
      expect(normaliseSaMobile(phone)).toBeNull();
    }
  });

  it("would pass the add-parent form (apart from the made-up number)", () => {
    for (const p of DEMO_PARENTS) {
      const parsed = payerInputSchema.safeParse({
        parentName: p.parentName,
        childName: p.childName,
        phone: "082 123 4567",
        language: p.language,
        schedule: { amountCents: p.amountCents, rhythm: p.rhythm, payday: p.payday },
      });
      expect(parsed.success, p.parentName).toBe(true);
    }
  });
});

describe.each(DAYS)("demo history seeded on %s", (today) => {
  const fees = planDemoFees(today);

  it("only covers due dates before today, since the schedules started (about four months)", () => {
    expect(fees.length).toBeGreaterThan(100);
    for (const f of fees) {
      expect(f.dueDate < today).toBe(true);
      expect(f.dueDate >= demoStartsOn(today)).toBe(true);
    }
    // Every monthly parent has at least 3 fees, so the summary can tell reliable from new.
    for (const [i, p] of DEMO_PARENTS.entries()) {
      if (p.rhythm === "MONTHLY") expect(fees.filter((f) => f.parent === i).length, p.parentName).toBeGreaterThanOrEqual(3);
    }
  });

  it("reads as a crèche that has been running a while in This week in plain words", () => {
    const rows = fees.map((f, i) => {
      const parent = DEMO_PARENTS[f.parent]!;
      const paidCents = paid(f);
      const lastPaid = f.payments.at(-1);
      return {
        id: `f${i}`,
        payerId: `p${f.parent}`,
        parentName: parent.parentName,
        childName: parent.childName,
        reference: "",
        rhythm: parent.rhythm,
        dueDate: f.dueDate,
        amountCents: f.amountCents,
        paidCents,
        status: paidCents >= f.amountCents ? ("PAID" as const) : paidCents > 0 ? ("PARTIAL" as const) : ("PENDING" as const),
        paidOnTime: paidCents >= f.amountCents && saDay(lastPaid!.at) <= f.dueDate,
        paidOn: paidCents >= f.amountCents ? saDay(lastPaid!.at) : null,
        requested: true,
        paymentUrl: null,
        balanceRequested: f.balanceAt !== null,
        remindersSent: f.reminders.length,
        remindedToday: false,
      };
    });
    const payers = DEMO_PARENTS.map((p, i) => ({ id: `p${i}`, firstName: firstName(p.parentName), rhythm: p.rhythm, feeCents: p.amountCents }));
    const insights = buildInsights({ rows, payers, today });
    // On-time monthly payers, and the early ones, have a record to show.
    expect(insights.reliable).toEqual(expect.arrayContaining(["Thandi", "Johan", "Grace", "Mpho"]));
    expect(insights.parents.some((p) => p.badge === "NEW")).toBe(false);
    // The late payer pays in full, but is never called reliable.
    expect(insights.reliable).not.toContain("Nomvula");
    expect(insights.suggestions).toContainEqual({ type: "REWARD_UPFRONT", count: 2 });
  });

  it("never pays more than is owed, or before the request, or in the future", () => {
    for (const f of fees) {
      expect(paid(f)).toBeLessThanOrEqual(f.amountCents);
      for (const p of f.payments) {
        expect(Number.isInteger(p.amountCents) && p.amountCents > 0).toBe(true);
        expect(p.at.getTime()).toBeGreaterThan(f.requestedAt.getTime());
        expect(saDay(p.at) < today).toBe(true);
      }
    }
  });

  it("reminds like the daily job: after the due date, before today, at most 3 times, only while unpaid", () => {
    for (const f of fees) {
      expect(f.reminders.length).toBeLessThanOrEqual(MAX_REMINDERS);
      for (const day of f.reminders) {
        expect(day > f.dueDate && day < today).toBe(true);
        const before = f.payments.filter((p) => saDay(p.at) < day).reduce((sum, p) => sum + p.amountCents, 0);
        expect(before).toBeLessThan(f.amountCents);
      }
    }
  });

  it("has every state a judge should see: paid on time, paid late, part-paid with a balance request, and overdue with reminders", () => {
    const paidInFull = fees.filter((f) => paid(f) === f.amountCents);
    expect(paidInFull.length / fees.length).toBeGreaterThan(0.6);
    expect(paidInFull.some((f) => saDay(f.payments.at(-1)!.at) <= f.dueDate)).toBe(true);
    expect(paidInFull.some((f) => saDay(f.payments.at(-1)!.at) > f.dueDate)).toBe(true);

    const partPaid = fees.filter((f) => paid(f) > 0 && paid(f) < f.amountCents);
    expect(partPaid).toHaveLength(1);
    expect(partPaid[0]!.balanceAt).not.toBeNull();

    expect(fees.some((f) => paid(f) === 0 && f.reminders.length > 0)).toBe(true);
    expect(fees.some((f) => f.byOwner)).toBe(true);
    // A balance is only requested for a part-paid fee.
    expect(fees.filter((f) => f.balanceAt)).toEqual(partPaid);
  });
});

describe("demo invites", () => {
  const ctx = { userId: "user", businessId: "11111111-1111-4111-8111-111111111111" };
  // Encrypting reads the app's env, which needs a database URL; nothing here connects to one.
  beforeAll(() => {
    if (!process.env.DATABASE_URL) vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/unused");
  });

  it.each(DAYS)("on %s: two awaiting approval, two open, one expired, all in the past", (day) => {
    const now = new Date(`${day}T07:00:00+02:00`);
    const { invites, consents } = demoInviteRows(ctx, now);
    const states = invites.map((i) => inviteState({ status: i.status ?? "OPEN", expiresAt: i.expiresAt as Date }, now));
    expect(states.sort()).toEqual(["AWAITING_APPROVAL", "AWAITING_APPROVAL", "EXPIRED", "OPEN", "OPEN"]);
    for (const i of invites) {
      expect((i.createdAt as Date).getTime()).toBeLessThan(now.getTime());
      if (i.submittedAt) {
        expect((i.submittedAt as Date).getTime()).toBeGreaterThan((i.createdAt as Date).getTime());
        expect((i.submittedAt as Date).getTime()).toBeLessThan(now.getTime());
      }
    }
    // Every answer has its consent, at the moment it was given.
    expect(consents.map((c) => c.inviteId).sort()).toEqual(invites.filter((i) => i.submittedAt).map((i) => i.id).sort());
    for (const c of consents) {
      expect(c.text).toBe(consentText("Kopano Crèche"));
      expect(c.consentedAt).toEqual(invites.find((i) => i.id === c.inviteId)!.submittedAt);
    }
  });

  it("asks for the server's split of the fee, and only from made-up numbers", () => {
    const now = new Date("2026-10-26T07:00:00+02:00");
    const { invites } = demoInviteRows(ctx, now);
    for (const i of invites.filter((i) => i.rhythm)) expect(i.amountCents).toBe(splitMonthlyFee(i.monthlyAmountCents, i.rhythm!));
    for (const i of invites) {
      if (!i.phoneEncrypted) {
        expect(inviteState({ status: "OPEN", expiresAt: i.expiresAt as Date }, now)).toBe("EXPIRED");
        continue;
      }
      const phone = payerPhone({ businessId: ctx.businessId, phoneEncrypted: i.phoneEncrypted });
      expect(normaliseSaMobile(phone)).toBeNull();
      expect(DEMO_PARENTS.map((_, n) => demoPhone(n))).not.toContain(phone);
    }
    expect(new Set(DEMO_INVITES.map((i) => i.phone)).size).toBe(DEMO_INVITES.length);
  });
});
