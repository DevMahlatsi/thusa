import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Keyed with SESSION_SECRET so a leaked database alone can't brute-force the 6-digit space.
export function hmac(value: string, secret = env().SESSION_SECRET): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hashOtp(challengeId: string, code: string, secret?: string): string {
  return hmac(`otp:${challengeId}:${code}`, secret);
}

export function otpMatches(storedHash: string, challengeId: string, code: string, secret?: string): boolean {
  const candidate = Buffer.from(hashOtp(challengeId, code, secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
