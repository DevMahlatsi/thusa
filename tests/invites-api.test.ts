// Route-level checks for the invite routes and the public POST /api/join: roles, session-only businessId,
// strict bodies (no amounts from the parent), the rate limit and ids. The invite service is mocked here;
// it runs against a real database in tests/integration/invites.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden, HttpError } from "@/lib/http";

type Role = "OWNER" | "STAFF" | "READONLY";

const session = vi.hoisted(() => ({ role: "OWNER" as Role, businessId: "biz-a", userId: "user-a" }));

vi.mock("@/lib/auth", () => ({
  requireBusinessUser: vi.fn(async (allowed: Role[] = ["OWNER", "STAFF", "READONLY"]) => {
    if (!allowed.includes(session.role)) throw forbidden();
    return { user: { id: session.userId }, businessId: session.businessId, role: session.role };
  }),
}));

vi.mock("@/lib/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invites")>();
  return {
    ...actual,
    createInvite: vi.fn(async () => ({ id: "inv", tokenHash: "secret-hash", tokenEncrypted: "secret" })),
    approveInvite: vi.fn(async () => ({ id: "payer" })),
    declineInvite: vi.fn(async () => undefined),
    cancelInvite: vi.fn(async () => undefined),
    assertJoinAllowed: vi.fn(async () => undefined),
    submitInvite: vi.fn(async () => ({ businessName: "Crèche A" })),
  };
});

const invites = await import("@/lib/invites");
const create = await import("@/app/api/invites/route");
const approve = await import("@/app/api/invites/[id]/approve/route");
const decline = await import("@/app/api/invites/[id]/decline/route");
const cancel = await import("@/app/api/invites/[id]/cancel/route");
const join = await import("@/app/api/join/route");

const ID = "0b6f1c3e-6f1a-4b8e-9a51-3c2d4e5f6a7b";
const TOKEN = "A".repeat(43);
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

function request(json: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/x", {
    method: "POST",
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
}

const inviteBody = { phone: "082 123 4567", childName: "Lerato", monthlyAmountCents: 120_000, parentAgreed: true };
const joinBody = {
  token: TOKEN,
  parentName: "Thandi Mokoena",
  rhythm: "WEEKLY",
  payday: 5,
  language: "zu",
  consent: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
});

describe("POST /api/invites", () => {
  it("creates the invite under the session's business and returns only its id", async () => {
    const res = await create.POST(request(inviteBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ invite: { id: "inv" } });
    expect(invites.createInvite).toHaveBeenCalledWith(
      { userId: "user-a", businessId: "biz-a" },
      { phone: "+27821234567", childName: "Lerato", monthlyAmountCents: 120_000, parentAgreed: true },
    );
  });

  it("needs the owner to confirm the parent agreed, with a message they can act on", async () => {
    const res = await create.POST(request({ ...inviteBody, parentAgreed: false }));
    expect(await res.json()).toEqual({ error: "Tick the box to confirm the parent agreed" });
  });

  it("rejects a businessId in the body instead of using it", async () => {
    expect((await create.POST(request({ ...inviteBody, businessId: "biz-b" }))).status).toBe(400);
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["no phone", { phone: undefined }],
    ["no confirmation that the parent agreed", { parentAgreed: undefined }],
    ["the box left unticked", { parentAgreed: false }],
    ["a phone that isn't an SA cellphone", { phone: "011 123 4567" }],
    ["a list of rhythms (every invite offers all three)", { allowedRhythms: ["WEEKLY"] }],
    ["a fee in rand, not cents", { monthlyAmountCents: 1200.5 }],
    ["a fee under R 1", { monthlyAmountCents: 99 }],
    ["a name with a link", { childName: "https://evil.example" }],
  ])("rejects %s", async (_name, change) => {
    expect((await create.POST(request({ ...inviteBody, ...change }))).status).toBe(400);
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  it("lets staff make invites but not view-only users", async () => {
    session.role = "STAFF";
    expect((await create.POST(request(inviteBody))).status).toBe(201);
    session.role = "READONLY";
    expect((await create.POST(request(inviteBody))).status).toBe(403);
    expect(invites.createInvite).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-site post", async () => {
    expect((await create.POST(request(inviteBody, { origin: "https://evil.example" }))).status).toBe(403);
    expect(invites.createInvite).not.toHaveBeenCalled();
  });
});

describe("approve, decline and cancel", () => {
  const routes = [
    ["approve", approve.POST, () => invites.approveInvite],
    ["decline", decline.POST, () => invites.declineInvite],
    ["cancel", cancel.POST, () => invites.cancelInvite],
  ] as const;

  it.each(routes)("%s acts for the session's business", async (_name, post, service) => {
    expect((await post(request({}), ctx())).status).toBeLessThan(300);
    expect(service()).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, ID);
  });

  it.each(routes)("%s refuses a body with anything in it", async (_name, post, service) => {
    expect((await post(request({ businessId: "biz-b" }), ctx())).status).toBe(400);
    expect((await post(request({ amountCents: 1 }), ctx())).status).toBe(400);
    expect(service()).not.toHaveBeenCalled();
  });

  it.each(routes)("%s answers 404 for an id that isn't a UUID, without calling the service", async (_name, post, service) => {
    expect((await post(request({}), ctx("not-a-uuid"))).status).toBe(404);
    expect(service()).not.toHaveBeenCalled();
  });

  it.each(routes)("%s is not for view-only users", async (_name, post, service) => {
    session.role = "READONLY";
    expect((await post(request({}), ctx())).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });

  it("passes on the service's 404 for another business's invite", async () => {
    vi.mocked(invites.approveInvite).mockRejectedValueOnce(new HttpError(404, "Invite not found."));
    const res = await approve.POST(request({}), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invite not found." });
  });
});

describe("POST /api/join (public)", () => {
  it("passes the checked answers on", async () => {
    const res = await join.POST(request(joinBody, { "x-forwarded-for": "203.0.113.9" }));
    expect(res.status).toBe(201);
    expect(invites.assertJoinAllowed).toHaveBeenCalledWith("203.0.113.9");
    expect(invites.submitInvite).toHaveBeenCalledWith(joinBody);
  });

  it.each([
    ["an amount", { amountCents: 1 }],
    ["a monthly fee", { monthlyAmountCents: 1 }],
    ["a businessId", { businessId: "biz-b" }],
    ["a child's name", { childName: "Someone else" }],
    ["a phone number", { phone: "083 555 1234" }],
  ])("refuses %s in the body: the parent can't set it", async (_name, extra) => {
    expect((await join.POST(request({ ...joinBody, ...extra }))).status).toBe(400);
    expect(invites.submitInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["without consent", { consent: false }, "Tick the box to agree to payment requests and reminders"],
    ["a weekday payday over 7", { payday: 8 }, "Choose your payday"],
    ["a malformed link", { token: "short" }, "This link isn't valid."],
    ["no name", { parentName: " " }, "Enter your name"],
  ])("refuses answers %s", async (_name, change, error) => {
    const res = await join.POST(request({ ...joinBody, ...change }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(invites.submitInvite).not.toHaveBeenCalled();
  });

  it("answers 429 when the IP is over its limit, before reading the body", async () => {
    vi.mocked(invites.assertJoinAllowed).mockRejectedValueOnce(new HttpError(429, "Too many tries. Please wait an hour and try again."));
    const res = await join.POST(request({ not: "even valid" }));
    expect(res.status).toBe(429);
    expect(invites.submitInvite).not.toHaveBeenCalled();
  });

  it("passes on a used or expired link as 410", async () => {
    vi.mocked(invites.submitInvite).mockRejectedValueOnce(new HttpError(410, "This link has expired."));
    expect((await join.POST(request(joinBody))).status).toBe(410);
  });

  it("refuses a cross-site post", async () => {
    expect((await join.POST(request(joinBody, { origin: "https://evil.example" }))).status).toBe(403);
    expect(invites.assertJoinAllowed).not.toHaveBeenCalled();
  });
});
