// GET /api/cron/daily and /api/cron/demo-reset: only Vercel Cron (or the owner), with the bearer secret,
// can start the daily job or reset the demo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/jobs/daily", () => ({ runDailyJobs: vi.fn(async () => ({ requests: 1 })) }));
vi.mock("@/lib/demo-seed", () => ({ resetDemoAccount: vi.fn(async () => ({ fees: 40 })) }));

const SECRET = "test-cron-secret-0123456789"; // gitleaks:allow

async function load(secret: string | undefined) {
  vi.resetModules();
  if (!process.env.DATABASE_URL) vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/unused");
  vi.stubEnv("CRON_SECRET", secret);
  const { runDailyJobs } = await import("@/jobs/daily");
  const route = await import("@/app/api/cron/daily/route");
  return { runDailyJobs, GET: route.GET };
}

const call = (auth?: string) =>
  new Request("http://localhost:3000/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/daily", () => {
  it("runs the job with the right secret", async () => {
    const { GET, runDailyJobs } = await load(SECRET);
    const res = await GET(call(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, summary: { requests: 1 } });
    expect(runDailyJobs).toHaveBeenCalledOnce();
  });

  it.each([undefined, "Bearer wrong-secret-0123456789", SECRET, `Bearer ${SECRET}x`])("refuses %s", async (auth) => {
    const { GET, runDailyJobs } = await load(SECRET);
    expect((await GET(call(auth))).status).toBe(401);
    expect(runDailyJobs).not.toHaveBeenCalled();
  });

  it.each([undefined, "short"])("never runs without a proper CRON_SECRET (%s)", async (secret) => {
    const { GET, runDailyJobs } = await load(secret);
    expect((await GET(call("Bearer short"))).status).toBe(503);
    expect((await GET(call("Bearer "))).status).toBe(503);
    expect(runDailyJobs).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/demo-reset", () => {
  async function loadReset(secret: string | undefined) {
    vi.resetModules();
    if (!process.env.DATABASE_URL) vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/unused");
    vi.stubEnv("CRON_SECRET", secret);
    const { resetDemoAccount } = await import("@/lib/demo-seed");
    const route = await import("@/app/api/cron/demo-reset/route");
    return { resetDemoAccount: vi.mocked(resetDemoAccount), GET: route.GET };
  }

  it("resets the demo with the right secret", async () => {
    const { GET, resetDemoAccount } = await loadReset(SECRET);
    const res = await GET(call(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, summary: { fees: 40 } });
    expect(resetDemoAccount).toHaveBeenCalledOnce();
  });

  it("says so when the demo login is off", async () => {
    const { GET, resetDemoAccount } = await loadReset(SECRET);
    resetDemoAccount.mockResolvedValueOnce(null);
    expect(await (await GET(call(`Bearer ${SECRET}`))).json()).toEqual({ ok: true, skipped: "demo_login_off" });
  });

  it.each([undefined, "Bearer wrong-secret-0123456789", SECRET])("refuses %s", async (auth) => {
    const { GET, resetDemoAccount } = await loadReset(SECRET);
    expect((await GET(call(auth))).status).toBe(401);
    expect(resetDemoAccount).not.toHaveBeenCalled();
  });

  it("never runs without a proper CRON_SECRET", async () => {
    const { GET, resetDemoAccount } = await loadReset("short");
    expect((await GET(call("Bearer short"))).status).toBe(503);
    expect(resetDemoAccount).not.toHaveBeenCalled();
  });
});
