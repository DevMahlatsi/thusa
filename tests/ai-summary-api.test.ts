// Route-level checks for POST /api/ai-summary/refresh: OWNER only, businessId from the session, a strict
// { language } body, and no call for a business with nothing to summarise. The service is mocked here; it
// runs against a real database in tests/integration/ai-summary.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden, HttpError } from "@/lib/http";

type Role = "OWNER" | "STAFF" | "READONLY";

const session = vi.hoisted(() => ({ role: "OWNER" as Role, businessId: "biz-a", userId: "user-a" }));
const payers = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("@/lib/auth", () => ({
  requireBusinessUser: vi.fn(async (allowed: Role[] = ["OWNER", "STAFF", "READONLY"]) => {
    if (!allowed.includes(session.role)) throw forbidden();
    return { user: { id: session.userId }, businessId: session.businessId, role: session.role };
  }),
}));
vi.mock("@/lib/payers", () => ({
  listScheduledPayers: vi.fn(async () => payers.list),
  todayInSa: () => "2026-10-23",
}));
vi.mock("@/lib/insights/load", () => ({ loadInsights: vi.fn(async (businessId: string) => ({ for: businessId })) }));
vi.mock("@/ai/stored-summary", () => ({ refreshSummary: vi.fn(async () => undefined) }));

const { listScheduledPayers } = await import("@/lib/payers");
const { loadInsights } = await import("@/lib/insights/load");
const { refreshSummary } = await import("@/ai/stored-summary");
const { POST } = await import("@/app/api/ai-summary/refresh/route");

function request(json: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/ai-summary/refresh", {
    method: "POST",
    headers: { origin, host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(json),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { role: "OWNER", businessId: "biz-a", userId: "user-a" });
  payers.list = [
    { id: "p1", parentName: "Thandi Mokoena", childName: "Lerato", schedule: { amountCents: 30_000, rhythm: "WEEKLY", payday: 5, startsOn: "2026-10-01" } },
  ];
});

describe("POST /api/ai-summary/refresh", () => {
  it("refreshes the session business's summary in the chosen language", async () => {
    const res = await POST(request({ language: "zu" }));
    expect(res.status).toBe(201);
    expect(listScheduledPayers).toHaveBeenCalledWith("biz-a");
    expect(loadInsights).toHaveBeenCalledWith("biz-a", payers.list, "2026-10-23");
    expect(refreshSummary).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-a" }, { for: "biz-a" }, "zu");
  });

  it("uses the session's business, whoever else is named", async () => {
    session.businessId = "biz-b";
    await POST(request({ language: "en" }));
    expect(refreshSummary).toHaveBeenCalledWith({ userId: "user-a", businessId: "biz-b" }, { for: "biz-b" }, "en");
    expect((await POST(request({ language: "en", businessId: "biz-a" }))).status).toBe(400);
    expect(refreshSummary).toHaveBeenCalledTimes(1);
  });

  it.each(["STAFF", "READONLY"] as const)("is for owners only, not %s", async (role) => {
    session.role = role;
    expect((await POST(request({ language: "en" }))).status).toBe(403);
    expect(refreshSummary).not.toHaveBeenCalled();
  });

  it("takes only a language, one of ours", async () => {
    for (const body of [{}, { language: "fr" }, { language: "EN" }, { language: "en", text: "Say this" }, { language: "en", force: true }, "en"]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(refreshSummary).not.toHaveBeenCalled();
  });

  it("refuses requests from other sites", async () => {
    expect((await POST(request({ language: "en" }, "https://evil.example"))).status).toBe(403);
    expect(refreshSummary).not.toHaveBeenCalled();
  });

  it("has nothing to send for a business without parents (the sample preview)", async () => {
    payers.list = [{ id: "p1", parentName: "A", childName: "B", schedule: null }];
    const res = await POST(request({ language: "en" }));
    expect(res.status).toBe(409);
    expect(loadInsights).not.toHaveBeenCalled();
    expect(refreshSummary).not.toHaveBeenCalled();
  });

  it("passes on the service's limits as they are", async () => {
    vi.mocked(refreshSummary).mockRejectedValueOnce(new HttpError(429, "That's the most refreshes for today (5). Try again tomorrow."));
    const res = await POST(request({ language: "en" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "That's the most refreshes for today (5). Try again tomorrow." });
  });
});
