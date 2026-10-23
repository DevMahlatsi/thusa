import { NextResponse } from "next/server";
import { requireBusinessUser, requireUser } from "@/lib/auth";
import { businessProfileSchema, createBusinessForUser, getBusiness, toBusinessDto, updateBusiness } from "@/lib/business";
import { apiRoute, HttpError, parseJson } from "@/lib/http";

export const GET = apiRoute(async () => {
  const { businessId } = await requireBusinessUser();
  const business = await getBusiness(businessId);
  if (!business) throw new HttpError(404, "Business not found.");
  return NextResponse.json({ business: toBusinessDto(business) });
});

// Onboarding: a logged-in user without a business creates one and becomes its OWNER.
export const POST = apiRoute(async (req) => {
  const user = await requireUser();
  if (user.businessId) throw new HttpError(409, "Your business is already set up.");
  const input = await parseJson(req, businessProfileSchema);
  const business = await createBusinessForUser(user.id, input);
  return NextResponse.json({ business: toBusinessDto(business) }, { status: 201 });
});

export const PATCH = apiRoute(async (req) => {
  const { user, businessId } = await requireBusinessUser(["OWNER"]);
  const input = await parseJson(req, businessProfileSchema);
  const business = await updateBusiness({ userId: user.id, businessId }, input);
  return NextResponse.json({ business: toBusinessDto(business) });
});
