import { hmac } from "./auth/crypto";
import { db } from "./db";

// Rate limits for public endpoints, counted in Postgres so they hold across serverless instances. Each
// request that is let through adds one row per key; a key is over its limit when its rows in the window
// reach the limit. Only a keyed hash of each key (an IP, an invite link) is stored.

export type Limit = { key: string; limit: number; windowMs: number };

const KEEP_MS = 2 * 24 * 60 * 60_000;

/**
 * True, and counted, if every key is under its limit. False, and nothing counted, if any key is over. The
 * check and the count run under one lock per bucket, so requests at the same moment can't all slip through.
 */
export async function takeRateLimit(bucket: string, limits: Limit[], now = new Date()): Promise<boolean> {
  const rows = limits.map((l) => ({ ...l, keyHash: hmac(`rate_limit:${bucket}:${l.key}`) }));
  return db().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`thusa.rate_limit:${bucket}`}))::text`;
    for (const r of rows) {
      const used = await tx.rateLimitHit.count({
        where: { bucket, keyHash: r.keyHash, createdAt: { gt: new Date(now.getTime() - r.windowMs) } },
      });
      if (used >= r.limit) return false;
    }
    await tx.rateLimitHit.createMany({ data: rows.map((r) => ({ bucket, keyHash: r.keyHash, createdAt: now })) });
    return true;
  });
}

/** Deletes rows older than any window needs (the daily job). */
export async function pruneRateLimitHits(now = new Date()): Promise<number> {
  const { count } = await db().rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
  return count;
}
