import { NextResponse } from "next/server";
import { resetDemoAccount } from "@/lib/demo-seed";
import { logger } from "@/lib/logger";
import { refuseWithoutCronSecret } from "../cron-secret";

// Rebuilds the judges' demo crèche (src/lib/demo-seed.ts). Vercel Cron calls it every morning before the
// daily job (vercel.json); the owner can also call it with the cron secret to reset the demo now.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const refused = refuseWithoutCronSecret(req);
  if (refused) return refused;
  try {
    const summary = await resetDemoAccount();
    if (!summary) return NextResponse.json({ ok: true, skipped: "demo_login_off" });
    logger.info("jobs.demo_reset", { ...summary });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    logger.error("jobs.demo_reset_failed", { error: err });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
