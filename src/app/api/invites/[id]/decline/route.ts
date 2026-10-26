import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { declineInvite } from "@/lib/invites";
import { emptyBodySchema, inviteId, type Ctx } from "../invite-id";

// Turns a parent's answers down. Their name and phone are cleared; nothing is ever sent to them.
export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await inviteId(ctx);
  await parseJson(req, emptyBodySchema);
  await declineInvite({ userId: user.id, businessId }, id);
  return NextResponse.json({ ok: true });
});
