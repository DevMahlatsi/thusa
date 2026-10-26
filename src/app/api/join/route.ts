import { NextResponse } from "next/server";
import { apiRoute, clientIp, parseJson } from "@/lib/http";
import { assertJoinAllowed, joinInputSchema, submitInvite } from "@/lib/invites";

// Public: a parent's answers from an invite link. There's no session. The link's secret (in the body, so it
// never sits in a logged path) finds the invite, and only that invite's business is touched. Rate-limited
// per IP before the body is even read; apiRoute still refuses cross-site posts.
export const POST = apiRoute(async (req) => {
  await assertJoinAllowed(clientIp(req));
  const input = await parseJson(req, joinInputSchema);
  const { businessName } = await submitInvite(input);
  return NextResponse.json({ businessName }, { status: 201 });
});
