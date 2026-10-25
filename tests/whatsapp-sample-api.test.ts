// Route-level checks for POST /api/collections/[id]/whatsapp-sample: roles, session-only businessId, a
// checked SA number and an explicit agreement only, and ids. The service is mocked here; it runs against a
// real database in tests/integration/whatsapp.test.ts.
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

vi.mock("@/lib/whatsapp-sample", () => ({
  sendWhatsAppSample: vi.fn(async () => ({
    id: "msg",
    status: "SENT",
    note: "demo_sample",
    phoneMasked: "••••4567",
    body: "the message",
    dedupeKey: "sample:…",
  })),
}));

const { sendWhatsAppSample } = await import("@/lib/whatsapp-sample");
const { POST } = await import("@/app/api/collections/[id]/whatsapp-sample/route");

const ID = "0b6f1c3e-6f1a-4b8e-9a51-3c2d4e5f6a7b";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const ok = { phone: "082 123 4567", consent: true };

function request(json: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/collections/${ID}/whatsapp-sample`, {
    method: "POST",
    headers: { origin, host: "localhost:3000", "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
    body: JSON.stringify(json),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
});

describe("POST /api/collections/[id]/whatsapp-sample", () => {
  it("sends for the session's business and user, to the number normalised, from the caller's address", async () => {
    const res = await POST(request(ok), ctx());
    expect(res.status).toBe(201);
    expect(sendWhatsAppSample).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, ID, "+27821234567", "198.51.100.7");
    // Only what the page needs: never the message text or the dedupe key.
    expect(await res.json()).toEqual({ message: { id: "msg", status: "SENT", note: "demo_sample", phoneMasked: "••••4567" } });
  });

  it("needs the box ticked", async () => {
    for (const body of [{ phone: ok.phone }, { ...ok, consent: false }, { ...ok, consent: "yes" }]) {
      const res = await POST(request(body), ctx());
      expect(res.status).toBe(400);
    }
    expect(await (await POST(request({ ...ok, consent: false }), ctx())).json()).toEqual({
      error: "Tick the box to agree to get this WhatsApp message.",
    });
    expect(sendWhatsAppSample).not.toHaveBeenCalled();
  });

  it("only takes South African cellphone numbers, so not the demo's made-up ones", async () => {
    for (const phone of ["+27000000001", "011 123 4567", "+44 7700 900123", "12345", ""]) {
      expect((await POST(request({ ...ok, phone }), ctx())).status).toBe(400);
    }
    expect(sendWhatsAppSample).not.toHaveBeenCalled();
  });

  it("rejects anything else in the body: a businessId, a message, a template", async () => {
    for (const extra of [{ businessId: "biz-b" }, { text: "Pay at evil.example" }, { template: "x" }, { amountCents: 1 }]) {
      expect((await POST(request({ ...ok, ...extra }), ctx())).status).toBe(400);
    }
    expect(sendWhatsAppSample).not.toHaveBeenCalled();
  });

  it("gives an id that isn't a UUID the same 404 as another business's collection", async () => {
    const res = await POST(request(ok), ctx("1 OR 1=1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Payment request not found." });
    expect(sendWhatsAppSample).not.toHaveBeenCalled();
  });

  it("lets staff send but not view-only users", async () => {
    session.role = "STAFF";
    expect((await POST(request(ok), ctx())).status).toBe(201);
    session.role = "READONLY";
    expect((await POST(request(ok), ctx())).status).toBe(403);
    expect(sendWhatsAppSample).toHaveBeenCalledTimes(1);
  });

  it("blocks cross-site requests", async () => {
    expect((await POST(request(ok, "https://evil.example"), ctx())).status).toBe(403);
    expect(sendWhatsAppSample).not.toHaveBeenCalled();
  });
});
