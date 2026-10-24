import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { sendReminder } from "@/lib/reminders";
import { collectionId, emptyBodySchema, type Ctx } from "../collection-id";

// Sends a polite reminder about one unpaid fee: at most one a day and three in all per fee.
export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await collectionId(ctx);
  await parseJson(req, emptyBodySchema);
  const message = await sendReminder({ userId: user.id, businessId }, id);
  return NextResponse.json({ message: { id: message.id, status: message.status, note: message.note } }, { status: 201 });
});
