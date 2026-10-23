import { NextResponse } from "next/server";
import { z } from "zod";
import { startSession } from "@/lib/auth";
import { verifyOtp } from "@/lib/auth/otp";
import { apiRoute, parseJson } from "@/lib/http";
import { saMobileSchema } from "@/lib/phone";

const bodySchema = z.strictObject({
  phone: saMobileSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const POST = apiRoute(async (req) => {
  const { phone, code } = await parseJson(req, bodySchema);
  const user = await verifyOtp(phone, code);
  await startSession(user.id);
  return NextResponse.json({ next: user.businessId ? "/dashboard" : "/onboarding" });
});
