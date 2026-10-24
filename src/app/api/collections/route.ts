import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { collectionRequestSchema, requestCollection, toCollectionDto } from "@/lib/collections";
import { apiRoute, parseJson } from "@/lib/http";

// Payment requests. The body names a parent and a due date; the amount comes from the stored schedule
// and businessId from the session. The strict schema rejects either one in the body.

export const POST = apiRoute(async (req) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const input = await parseJson(req, collectionRequestSchema);
  const { collection, sent } = await requestCollection({ userId: user.id, businessId }, input);
  return NextResponse.json({ collection: toCollectionDto(collection) }, { status: sent ? 201 : 200 });
});
