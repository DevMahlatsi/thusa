import { NextResponse } from "next/server";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, HttpError, parseJson } from "@/lib/http";
import { archivePayer, getPayer, payerIdSchema, payerUpdateSchema, toPayerDto, updatePayer } from "@/lib/payers";

type Ctx = { params: Promise<{ id: string }> };

// Any id that isn't a UUID can't exist, so it gets the same 404 as another business's payer.
async function payerId(ctx: Ctx): Promise<string> {
  const parsed = payerIdSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw new HttpError(404, "Parent not found.");
  return parsed.data;
}

export const GET = apiRoute<Ctx>(async (_req, ctx) => {
  const { businessId } = await requireBusinessUser();
  const payer = await getPayer(businessId, await payerId(ctx));
  if (!payer || payer.archivedAt) throw new HttpError(404, "Parent not found.");
  return NextResponse.json({ payer: toPayerDto(payer) });
});

export const PATCH = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await payerId(ctx);
  const input = await parseJson(req, payerUpdateSchema);
  const payer = await updatePayer({ userId: user.id, businessId }, id, input);
  return NextResponse.json({ payer: toPayerDto(payer) });
});

// Archives: the payer leaves lists and future collections, but their history stays.
export const DELETE = apiRoute<Ctx>(async (_req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  await archivePayer({ userId: user.id, businessId }, await payerId(ctx));
  return new NextResponse(null, { status: 204 });
});
