// Route-level checks for /api/payers: roles, session-only businessId and 404s. The payer service is
// mocked here; its tenant isolation against a real database is in tests/integration/payers.test.ts.
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

vi.mock("@/lib/payers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payers")>();
  const row = { id: "row" };
  return {
    ...actual,
    createPayer: vi.fn(async () => row),
    updatePayer: vi.fn(async () => row),
    archivePayer: vi.fn(async () => undefined),
    getPayer: vi.fn(async () => null),
    listPayers: vi.fn(async () => []),
    toPayerDto: vi.fn(() => ({ id: "row" })),
  };
});

const payers = await import("@/lib/payers");
const collection = await import("@/app/api/payers/route");
const single = await import("@/app/api/payers/[id]/route");

const ID = "0b6f1c3e-6f1a-4b8e-9a51-3c2d4e5f6a7b";
const body = {
  parentName: "Thandi Mokoena",
  childName: "Lerato",
  phone: "082 123 4567",
  schedule: { amountCents: 12_500, rhythm: "WEEKLY", payday: 5, startsOn: "2026-11-02" },
};

function request(method: string, json?: unknown) {
  return new Request("http://localhost:3000/api/payers", {
    method,
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
});

describe("POST /api/payers", () => {
  it("creates the payer under the session's business", async () => {
    const res = await collection.POST(request("POST", body));
    expect(res.status).toBe(201);
    expect(payers.createPayer).toHaveBeenCalledWith(
      { userId: "user-a", businessId: "biz-a" },
      expect.objectContaining({ phone: "+27821234567" }),
    );
  });

  it("rejects a businessId in the body instead of using it", async () => {
    const res = await collection.POST(request("POST", { ...body, businessId: "biz-b" }));
    expect(res.status).toBe(400);
    expect(payers.createPayer).not.toHaveBeenCalled();
  });

  it("lets staff add parents but not view-only users", async () => {
    session.role = "STAFF";
    expect((await collection.POST(request("POST", body))).status).toBe(201);
    session.role = "READONLY";
    expect((await collection.POST(request("POST", body))).status).toBe(403);
    expect(payers.createPayer).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input with a friendly message", async () => {
    const res = await collection.POST(request("POST", { ...body, phone: "123" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Enter a South African cellphone number, e.g. 082 123 4567" });
  });
});

describe("/api/payers/[id]", () => {
  it("updates without a phone, keeping the stored one", async () => {
    const res = await single.PATCH(request("PATCH", { ...body, phone: undefined }), ctx(ID));
    expect(res.status).toBe(200);
    expect(payers.updatePayer).toHaveBeenCalledWith(
      { userId: "user-a", businessId: "biz-a" },
      ID,
      expect.not.objectContaining({ phone: expect.anything() }),
    );
  });

  it("answers 404 for an id that isn't a UUID, without touching the database", async () => {
    expect((await single.PATCH(request("PATCH", body), ctx("not-a-uuid"))).status).toBe(404);
    expect((await single.DELETE(request("DELETE"), ctx("not-a-uuid"))).status).toBe(404);
    expect(payers.updatePayer).not.toHaveBeenCalled();
    expect(payers.archivePayer).not.toHaveBeenCalled();
  });

  it("passes on the service's 404 for another business's payer", async () => {
    vi.mocked(payers.updatePayer).mockRejectedValueOnce(new HttpError(404, "Parent not found."));
    const res = await single.PATCH(request("PATCH", body), ctx(ID));
    expect(res.status).toBe(404);
    expect((await single.GET(request("GET"), ctx(ID))).status).toBe(404);
  });

  it("archives on DELETE, scoped to the session's business", async () => {
    const res = await single.DELETE(request("DELETE"), ctx(ID));
    expect(res.status).toBe(204);
    expect(payers.archivePayer).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, ID);
  });

  it("doesn't let view-only users edit or remove", async () => {
    session.role = "READONLY";
    expect((await single.PATCH(request("PATCH", body), ctx(ID))).status).toBe(403);
    expect((await single.DELETE(request("DELETE"), ctx(ID))).status).toBe(403);
  });
});
