import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { createInvite, inviteInputSchema } from "@/lib/invites";

// Invites for parents to add themselves. businessId always comes from the session; the strict schema
// rejects one in the body. The link itself is only shown on the invite's page, never returned here.
export const POST = apiRoute(async (req) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const input = await parseJson(req, inviteInputSchema);
  const invite = await createInvite({ userId: user.id, businessId }, input);
  return NextResponse.json({ invite: { id: invite.id } }, { status: 201 });
});
