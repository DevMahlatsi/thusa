import { db } from "../db";
import { generateSessionToken, hashSessionToken } from "./crypto";

export const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000);
  await db().session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function findSessionUser(token: string) {
  const session = await db().session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  return { sessionId: session.id, user: session.user };
}

export async function revokeSession(token: string) {
  await db().session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
