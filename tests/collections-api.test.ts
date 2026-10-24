// Route-level checks for POST /api/collections: roles, session-only businessId, and no client amounts.
// The collection service is mocked here; it runs against a real database in
// tests/integration/collections.test.ts.
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

vi.mock("@/lib/collections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/collections")>();
  return {
    ...actual,
    requestCollection: vi.fn(async () => ({ collection: { id: "row" }, sent: true })),
    toCollectionDto: vi.fn(() => ({ id: "row" })),
  };
});

const collections = await import("@/lib/collections");
const route = await import("@/app/api/collections/route");

const PAYER = "0b6f1c3e-6f1a-4b8e-9a51-3c2d4e5f6a7b";
const body = { payerId: PAYER, dueDate: "2026-10-30" };

function request(json: unknown) {
  return new Request("http://localhost:3000/api/collections", {
    method: "POST",
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(json),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
});

describe("POST /api/collections", () => {
  it("requests the collection under the session's business", async () => {
    const res = await route.POST(request(body));
    expect(res.status).toBe(201);
    expect(collections.requestCollection).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, body);
  });

  it("answers 200 when the due date already had a request", async () => {
    vi.mocked(collections.requestCollection).mockResolvedValueOnce({ collection: { id: "row" }, sent: false } as never);
    expect((await route.POST(request(body))).status).toBe(200);
  });

  it("rejects an amount from the client instead of using it", async () => {
    const res = await route.POST(request({ ...body, amountCents: 1 }));
    expect(res.status).toBe(400);
    expect(collections.requestCollection).not.toHaveBeenCalled();
  });

  it("rejects a businessId in the body", async () => {
    expect((await route.POST(request({ ...body, businessId: "biz-b" }))).status).toBe(400);
    expect(collections.requestCollection).not.toHaveBeenCalled();
  });

  it("rejects a payer id that isn't a UUID and a malformed date", async () => {
    const bad = await route.POST(request({ ...body, payerId: "1 OR 1=1" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Parent not found." });
    expect((await route.POST(request({ ...body, dueDate: "30/10/2026" }))).status).toBe(400);
    expect(collections.requestCollection).not.toHaveBeenCalled();
  });

  it("lets staff send requests but not view-only users", async () => {
    session.role = "STAFF";
    expect((await route.POST(request(body))).status).toBe(201);
    session.role = "READONLY";
    expect((await route.POST(request(body))).status).toBe(403);
    expect(collections.requestCollection).toHaveBeenCalledTimes(1);
  });

  it("blocks cross-site requests", async () => {
    const req = new Request("http://localhost:3000/api/collections", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await route.POST(req)).status).toBe(403);
    expect(collections.requestCollection).not.toHaveBeenCalled();
  });
});

describe("newReference", () => {
  it("is short, readable and different every time", () => {
    const refs = Array.from({ length: 500 }, () => collections.newReference());
    for (const ref of refs) expect(ref).toMatch(/^TH[2-9A-HJKMNP-Z]{8}$/);
    expect(new Set(refs).size).toBe(refs.length);
  });
});
