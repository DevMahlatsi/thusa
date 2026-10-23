import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, parseJson } from "@/lib/http";
import { createPayer, listPayers, payerInputSchema, toPayerDto } from "@/lib/payers";

// Payers (parents). businessId always comes from the session; the strict schema rejects one in the body.

export const GET = apiRoute(async () => {
  const { businessId } = await requireBusinessUser();
  const payers = await listPayers(businessId);
  return NextResponse.json({ payers: payers.map(toPayerDto) });
});

export const POST = apiRoute(async (req) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const input = await parseJson(req, payerInputSchema);
  const payer = await createPayer({ userId: user.id, businessId }, input);
  return NextResponse.json({ payer: toPayerDto(payer) }, { status: 201 });
});
