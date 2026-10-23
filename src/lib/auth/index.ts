import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { isProduction } from "../env";
import { forbidden, HttpError, unauthorised } from "../http";
import { createSession, findSessionUser, revokeSession } from "./session";

// __Host- requires Secure, which plain-http localhost can't always satisfy.
const cookieName = () => (isProduction() ? "__Host-thusa_session" : "thusa_session");

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (token) await revokeSession(token);
  jar.delete(cookieName());
}

export async function getCurrentUser() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) return null;
  return (await findSessionUser(token))?.user ?? null;
}

/** For API routes: the logged-in user, or 401. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorised();
  return user;
}

/**
 * For API routes that touch business data. businessId always comes from the session,
 * never from the request.
 */
export async function requireBusinessUser(allowedRoles: Role[] = ["OWNER", "STAFF", "READONLY"]) {
  const user = await requireUser();
  if (!user.businessId) throw new HttpError(409, "Set up your business profile first.");
  if (!allowedRoles.includes(user.role)) throw forbidden();
  return { user, businessId: user.businessId, role: user.role };
}

/** For pages: redirects instead of throwing. */
export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageBusinessUser() {
  const user = await requirePageUser();
  if (!user.businessId) redirect("/onboarding");
  return { user, businessId: user.businessId, role: user.role };
}
