import { randomUUID } from "node:crypto";
import { sendTemplate } from "@/messaging/adapter";
import { audit } from "../audit";
import { db } from "../db";
import { HttpError } from "../http";
import { logger } from "../logger";
import { generateOtp, hashOtp, hmac, otpMatches } from "./crypto";
import { demoLogin } from "./demo";

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 3;

const MINUTE = 60_000;
export const OTP_LIMITS = {
  cooldownMs: 30_000, // between requests for the same phone
  perPhone15Min: 3,
  perPhoneDay: 10,
  perIpHour: 10,
  // The demo sends no SMS and its code is on the login page, so this only stops a script filling the table.
  demoPerIpHour: 60,
};

const tooMany = () => new HttpError(429, "Too many code requests. Please wait a few minutes and try again.");
const invalidCode = () => new HttpError(400, "That code is wrong or has expired. Check the SMS or ask for a new code.");

export async function requestOtp(phoneE164: string, ip: string): Promise<void> {
  const now = Date.now();
  const ipHash = hmac(`ip:${ip}`);
  const since = (ms: number) => ({ gte: new Date(now - ms) });
  const demo = demoLogin();
  const isDemo = demo?.phoneE164 === phoneE164;
  // Demo and real requests from one IP are counted apart, so recording the demo (or a room of judges on
  // one network) never uses up a real owner's allowance, and real requests never block the demo.
  const ipScope = isDemo ? { phoneE164 } : demo ? { phoneE164: { not: demo.phoneE164 } } : {};

  const [lastForPhone, phone15Min, phoneDay, ipHour] = await Promise.all([
    db().otpChallenge.findFirst({ where: { phoneE164, createdAt: since(OTP_LIMITS.cooldownMs) } }),
    db().otpChallenge.count({ where: { phoneE164, createdAt: since(15 * MINUTE) } }),
    db().otpChallenge.count({ where: { phoneE164, createdAt: since(24 * 60 * MINUTE) } }),
    db().otpChallenge.count({ where: { ipHash, ...ipScope, createdAt: since(60 * MINUTE) } }),
  ]);
  // Several judges share the demo number, so it skips the per-phone limits and has its own per-IP limit.
  const phoneLimited =
    !isDemo && (Boolean(lastForPhone) || phone15Min >= OTP_LIMITS.perPhone15Min || phoneDay >= OTP_LIMITS.perPhoneDay);
  const ipLimit = isDemo ? OTP_LIMITS.demoPerIpHour : OTP_LIMITS.perIpHour;
  if (phoneLimited || ipHour >= ipLimit) {
    logger.warn("auth.otp_rate_limited", { phone: phoneE164 });
    throw tooMany();
  }

  const id = randomUUID();
  const code = isDemo ? demo.code : generateOtp();
  await db().otpChallenge.create({
    data: {
      id,
      phoneE164,
      codeHash: hashOtp(id, code),
      ipHash,
      expiresAt: new Date(now + OTP_TTL_MINUTES * MINUTE),
    },
  });

  if (isDemo) {
    logger.info("auth.otp_demo_issued", { phone: phoneE164 });
    return;
  }

  try {
    // Owners haven't chosen a language before logging in, so the login code goes out in English.
    await sendTemplate({
      to: phoneE164,
      channel: "sms",
      language: "en",
      template: "otp",
      params: { code, minutes: OTP_TTL_MINUTES },
    });
  } catch (err) {
    logger.error("auth.otp_send_failed", { phone: phoneE164, error: err });
    throw new HttpError(502, "We couldn't send your code. Please try again.");
  }
}

/** Checks the latest code for this phone. Returns the user (created on first login). */
export async function verifyOtp(phoneE164: string, code: string) {
  const challenge = await db().otpChallenge.findFirst({
    where: { phoneE164, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) throw invalidCode();

  // Claim an attempt atomically so parallel guesses can't exceed the limit.
  const claimed = await db().otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new HttpError(429, "Too many wrong codes. Please ask for a new code.");
  }

  if (!otpMatches(challenge.codeHash, challenge.id, code)) {
    if (challenge.attempts + 1 >= OTP_MAX_ATTEMPTS) {
      logger.warn("auth.otp_locked", { phone: phoneE164 });
      await audit({ action: "auth.otp_locked" });
    }
    throw invalidCode();
  }

  // Single use: only one request can flip consumedAt.
  const consumed = await db().otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw invalidCode();

  const user = await db().user.upsert({
    where: { phoneE164 },
    create: { phoneE164, lastLoginAt: new Date() },
    update: { lastLoginAt: new Date() },
  });
  await audit({ action: "auth.login", userId: user.id, businessId: user.businessId });
  return user;
}
