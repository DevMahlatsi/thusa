import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { approveInvite } from "@/lib/invites";
import { emptyBodySchema, inviteId, type Ctx } from "../invite-id";

// Approves a parent's answers: they become a parent with a schedule, and requests can go out from today.
export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await inviteId(ctx);
  await parseJson(req, emptyBodySchema);
  const payer = await approveInvite({ userId: user.id, businessId }, id);
  return NextResponse.json({ payer: { id: payer.id } }, { status: 201 });
});
