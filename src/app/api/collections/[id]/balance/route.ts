import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { requestBalance, toBalanceRequestDto } from "@/lib/balance-requests";
import { apiRoute, parseJson } from "@/lib/http";
import { collectionId, emptyBodySchema, type Ctx } from "../collection-id";

// Requests what's still owed on a part-paid fee. The amount is worked out on the server.
export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await collectionId(ctx);
  await parseJson(req, emptyBodySchema);
  const { balanceRequest, sent } = await requestBalance({ userId: user.id, businessId }, id);
  return NextResponse.json({ balanceRequest: toBalanceRequestDto(balanceRequest) }, { status: sent ? 201 : 200 });
});
