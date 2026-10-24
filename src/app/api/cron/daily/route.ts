import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDailyJobs } from "@/jobs/daily";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>". Not
// apiRoute: there's no session, and the secret is the only way in. Without CRON_SECRET it never runs.

export const dynamic = "force-dynamic";
// The run stops itself at MAX_ACTIONS_PER_RUN; this is the ceiling for slow provider calls.
export const maxDuration = 300;

const digest = (value: string) => createHash("sha256").update(value).digest();

function authorised(req: Request, secret: string): boolean {
  // Hashing first gives equal lengths, so the comparison takes the same time whatever was sent.
  return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || secret.length < 16) {
    logger.error("jobs.not_configured", { reason: "CRON_SECRET is missing or shorter than 16 characters" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!authorised(req, secret)) {
    logger.warn("jobs.bad_cron_secret");
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const summary = await runDailyJobs();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    logger.error("jobs.daily_run_failed", { error: err });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
