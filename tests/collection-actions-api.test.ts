// Route-level checks for POST /api/collections/[id]/reminders and /balance: roles, session-only
// businessId, an empty body only (no amounts), and ids. The services are mocked here; they run against
// a real database in tests/integration/messages.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden } from "@/lib/http";

type Role = "OWNER" | "STAFF" | "READONLY";

const session = vi.hoisted(() => ({ role: "OWNER" as Role, businessId: "biz-a", userId: "user-a" }));

vi.mock("@/lib/auth", () => ({
  requireBusinessUser: vi.fn(async (allowed: Role[] = ["OWNER", "STAFF", "READONLY"]) => {
    if (!allowed.includes(session.role)) throw forbidden();
    return { user: { id: session.userId }, businessId: session.businessId, role: session.role };
  }),
}));

vi.mock("@/lib/reminders", () => ({
  sendReminder: vi.fn(async () => ({ id: "msg", status: "SENT", note: null, body: "secret text" })),
}));

vi.mock("@/lib/balance-requests", () => ({
  requestBalance: vi.fn(async () => ({ balanceRequest: { id: "bal" }, sent: true })),
  toBalanceRequestDto: vi.fn(() => ({ id: "bal" })),
}));

const { sendReminder } = await import("@/lib/reminders");
const { requestBalance } = await import("@/lib/balance-requests");
const reminders = await import("@/app/api/collections/[id]/reminders/route");
const balance = await import("@/app/api/collections/[id]/balance/route");

const ID = "0b6f1c3e-6f1a-4b8e-9a51-3c2d4e5f6a7b";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

function request(json: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/collections/${ID}/x`, {
    method: "POST",
    headers: { origin, host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(json),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
});

describe.each([
  ["reminders", () => reminders.POST, () => sendReminder],
  ["balance", () => balance.POST, () => requestBalance],
] as const)("POST /api/collections/[id]/%s", (_name, post, service) => {
  it("acts for the session's business and user", async () => {
    const res = await post()(request({}), ctx());
    expect(res.status).toBe(201);
    expect(service()).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, ID);
  });

  it("rejects an amount or a businessId in the body", async () => {
    expect((await post()(request({ amountCents: 100 }), ctx())).status).toBe(400);
    expect((await post()(request({ businessId: "biz-b" }), ctx())).status).toBe(400);
    expect(service()).not.toHaveBeenCalled();
  });

  it("gives an id that isn't a UUID the same 404 as another business's collection", async () => {
    const res = await post()(request({}), ctx("1 OR 1=1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Payment request not found." });
    expect(service()).not.toHaveBeenCalled();
  });

  it("lets staff act but not view-only users", async () => {
    session.role = "STAFF";
    expect((await post()(request({}), ctx())).status).toBe(201);
    session.role = "READONLY";
    expect((await post()(request({}), ctx())).status).toBe(403);
    expect(service()).toHaveBeenCalledTimes(1);
  });

  it("blocks cross-site requests", async () => {
    expect((await post()(request({}, "https://evil.example"), ctx())).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });
});

it("returns the reminder's status but not its text", async () => {
  const res = await reminders.POST(request({}), ctx());
  expect(await res.json()).toEqual({ message: { id: "msg", status: "SENT", note: null } });
});

it("answers 200 when the balance was already requested", async () => {
  vi.mocked(requestBalance).mockResolvedValueOnce({ balanceRequest: { id: "bal" }, sent: false } as never);
  expect((await balance.POST(request({}), ctx())).status).toBe(200);
});
