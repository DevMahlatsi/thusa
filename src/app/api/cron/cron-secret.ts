import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Vercel Cron calls the /api/cron/* routes with "Authorization: Bearer <CRON_SECRET>". There's no
// session, so the secret is the only way in. Without CRON_SECRET they never run.

const digest = (value: string) => createHash("sha256").update(value).digest();

/** An error response to return, or null when the request carries the cron secret. */
export function refuseWithoutCronSecret(req: Request): NextResponse | null {
  const secret = env().CRON_SECRET;
  if (!secret || secret.length < 16) {
    logger.error("jobs.not_configured", { reason: "CRON_SECRET is missing or shorter than 16 characters" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  // Hashing first gives equal lengths, so the comparison takes the same time whatever was sent.
  if (!timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    logger.warn("jobs.bad_cron_secret");
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return null;
}
