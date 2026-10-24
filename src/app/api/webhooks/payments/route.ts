import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { handlePaymentWebhook } from "@/lib/payment-webhooks";

// Payment provider webhooks (Stitch Express via Svix). Not wrapped in apiRoute: the provider is a
// different origin with no session, so it's authenticated by the signature instead, which
// handlePaymentWebhook checks over the exact raw body before anything else.

// Real events are well under 1 KB.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, outcome: "too_large" }, { status: 413 });
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, outcome: "too_large" }, { status: 413 });
    }
    const { status, body } = await handlePaymentWebhook(rawBody, req.headers);
    return NextResponse.json(body, { status });
  } catch (err) {
    logger.error("webhooks.unhandled_error", { error: err });
    return NextResponse.json({ ok: false, outcome: "error" }, { status: 500 });
  }
}
