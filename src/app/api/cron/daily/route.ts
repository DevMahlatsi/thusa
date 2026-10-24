import { NextResponse } from "next/server";
import { runDailyJobs } from "@/jobs/daily";
import { logger } from "@/lib/logger";
import { refuseWithoutCronSecret } from "../cron-secret";

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>". Not
// apiRoute: there's no session, and the secret is the only way in. Without CRON_SECRET it never runs.

export const dynamic = "force-dynamic";
// The run stops itself at MAX_ACTIONS_PER_RUN; this is the ceiling for slow provider calls.
export const maxDuration = 300;

export async function GET(req: Request) {
  const refused = refuseWithoutCronSecret(req);
  if (refused) return refused;
  try {
    const summary = await runDailyJobs();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    logger.error("jobs.daily_run_failed", { error: err });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
