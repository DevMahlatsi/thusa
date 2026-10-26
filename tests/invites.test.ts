// The invite rules that need no database: links, states, the parent's options and the strict schemas.
// The flow itself (single use, expiry, approval, tenant isolation) is in tests/integration/invites.test.ts.
import { describe, expect, it } from "vitest";
import {
  closedMessage,
  consentText,
  hashInviteToken,
  inviteLink,
  inviteState,
  joinInputSchema,
  rhythmOptions,
} from "@/lib/invites";

const TOKEN = "Ab3_-".repeat(8) + "xyz";

describe("inviteLink", () => {
  it("points at /join/<secret> on Thusa's own host", () => {
    expect(inviteLink("https://mythusa.vercel.app", TOKEN)).toBe(`https://mythusa.vercel.app/join/${TOKEN}`);
    // A base with a path or trailing slash still gives the same link.
    expect(inviteLink("https://mythusa.vercel.app/some/path/", TOKEN)).toBe(`https://mythusa.vercel.app/join/${TOKEN}`);
  });

  it("allows plain http only on localhost, for dev", () => {
    expect(inviteLink("http://localhost:3000", TOKEN)).toBe(`http://localhost:3000/join/${TOKEN}`);
    expect(() => inviteLink("http://mythusa.vercel.app", TOKEN)).toThrow(/https/);
    expect(() => inviteLink("https://user:pass@mythusa.vercel.app", TOKEN)).toThrow(/https/);
  });

  it("refuses anything that isn't an invite secret", () => {
    expect(() => inviteLink("https://mythusa.vercel.app", "short")).toThrow();
    expect(() => inviteLink("https://mythusa.vercel.app", `${TOKEN.slice(0, 42)}/`)).toThrow();
  });

  it("looks links up by a hash, never the secret itself", () => {
    expect(hashInviteToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(TOKEN)).not.toContain(TOKEN);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-10-26T12:00:00+02:00");
  const later = new Date("2026-10-27T12:00:00+02:00");
  const earlier = new Date("2026-10-25T12:00:00+02:00");

  it("is EXPIRED for an open invite past its expiry, and only then", () => {
    expect(inviteState({ status: "OPEN", expiresAt: later }, now)).toBe("OPEN");
    expect(inviteState({ status: "OPEN", expiresAt: now }, now)).toBe("EXPIRED");
    expect(inviteState({ status: "OPEN", expiresAt: earlier }, now)).toBe("EXPIRED");
  });

  it("shows submitted answers as awaiting approval, whatever the expiry", () => {
    expect(inviteState({ status: "SUBMITTED", expiresAt: earlier }, now)).toBe("AWAITING_APPROVAL");
    expect(inviteState({ status: "APPROVED", expiresAt: earlier }, now)).toBe("APPROVED");
  });
});

describe("rhythmOptions", () => {
  it("offers only the allowed rhythms, monthly first, with amounts worked out from the monthly fee", () => {
    expect(rhythmOptions({ monthlyAmountCents: 120_000, allowedRhythms: ["WEEKLY", "MONTHLY"] })).toEqual([
      { rhythm: "MONTHLY", amountCents: 120_000 },
      { rhythm: "WEEKLY", amountCents: 27_692 },
    ]);
  });
});

describe("parent-facing words", () => {
  it("consent names the crèche and Thusa, word for word as specified", () => {
    expect(consentText("Kopano Crèche")).toBe("I agree to receive payment requests and reminders from Kopano Crèche through Thusa.");
  });

  it("says why a link can't be used", () => {
    expect(closedMessage("EXPIRED", "Kopano Crèche")).toMatch(/expired.*Kopano Crèche/);
    expect(closedMessage("AWAITING_APPROVAL", "Kopano Crèche")).toMatch(/already been used/);
    expect(closedMessage("CANCELLED", "Kopano Crèche")).toMatch(/no longer valid/);
  });
});

describe("joinInputSchema", () => {
  const valid = { token: TOKEN, parentName: "Thandi", rhythm: "MONTHLY", payday: 31, language: "en", consent: true };

  it("takes a month day for monthly and a weekday otherwise", () => {
    expect(joinInputSchema.safeParse(valid).success).toBe(true);
    expect(joinInputSchema.safeParse({ ...valid, rhythm: "WEEKLY" }).success).toBe(false);
    expect(joinInputSchema.safeParse({ ...valid, rhythm: "FORTNIGHTLY", payday: 7 }).success).toBe(true);
    expect(joinInputSchema.safeParse({ ...valid, payday: 0 }).success).toBe(false);
  });

  it("has no amount or phone field at all: one sent along is refused", () => {
    expect(joinInputSchema.safeParse({ ...valid, amountCents: 100 }).success).toBe(false);
    expect(joinInputSchema.safeParse({ ...valid, phone: "0821234567" }).success).toBe(false);
  });

  it("needs consent to be exactly true", () => {
    expect(joinInputSchema.safeParse({ ...valid, consent: "true" }).success).toBe(false);
    expect(joinInputSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
  });
});
