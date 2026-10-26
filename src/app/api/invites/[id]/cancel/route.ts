import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { cancelInvite } from "@/lib/invites";
import { emptyBodySchema, inviteId, type Ctx } from "../invite-id";

// Withdraws a link the parent hasn't used yet.
export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await inviteId(ctx);
  await parseJson(req, emptyBodySchema);
  await cancelInvite({ userId: user.id, businessId }, id);
  return NextResponse.json({ ok: true });
});
