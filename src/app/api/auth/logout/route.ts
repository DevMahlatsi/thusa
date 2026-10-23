import { NextResponse } from "next/server";
import { endSession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiRoute } from "@/lib/http";

export const POST = apiRoute(async () => {
  const user = await getCurrentUser();
  await endSession();
  if (user) await audit({ action: "auth.logout", userId: user.id, businessId: user.businessId });
  return NextResponse.json({ ok: true });
});
