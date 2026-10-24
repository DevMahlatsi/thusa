// GET /api/cron/daily: only Vercel Cron, with the bearer secret, can start the daily job.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/jobs/daily", () => ({ runDailyJobs: vi.fn(async () => ({ requests: 1 })) }));

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
