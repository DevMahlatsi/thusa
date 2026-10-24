import { createHmac, timingSafeEqual } from "node:crypto";

// Svix webhook signatures (used by Stitch Express, and by the mock so dev runs the same path).
// The signature is HMAC-SHA256 over `{svix-id}.{svix-timestamp}.{raw body}` with the base64 key after
// `whsec_`. svix-signature lists one or more `v1,<base64>` separated by spaces (several during a secret
// rotation); any one matching is enough.

// Svix's own default: older (or future) timestamps are refused, so a captured delivery can't be replayed.
const TOLERANCE_SECONDS = 5 * 60;

export class WebhookSignatureError extends Error {}

function key(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length < 16) throw new Error("Webhook secret is not a valid whsec_ key");
  return decoded;
}

function sign(secret: string, id: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", key(secret)).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
}

/** Returns the svix-id once the signature and timestamp check out; throws WebhookSignatureError otherwise. */
export function verifySvix(secret: string, rawBody: string, headers: Headers, now = new Date()): string {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) throw new WebhookSignatureError("Missing Svix headers");
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now.getTime() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    throw new WebhookSignatureError("Svix timestamp outside tolerance");
  }
  const expected = Buffer.from(sign(secret, id, timestamp, rawBody));
  const matches = signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) throw new WebhookSignatureError("Svix signature mismatch");
  return id;
}

/** The headers Svix would send. For the mock provider and tests. */
export function svixHeaders(secret: string, id: string, rawBody: string, now = new Date()): Headers {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sign(secret, id, timestamp, rawBody)}`,
    "content-type": "application/json",
  });
}
