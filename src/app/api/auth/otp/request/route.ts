import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/lib/auth/otp";
import { apiRoute, clientIp, parseJson } from "@/lib/http";
import { saMobileSchema } from "@/lib/phone";

const bodySchema = z.strictObject({ phone: saMobileSchema });

export const POST = apiRoute(async (req) => {
  const { phone } = await parseJson(req, bodySchema);
  await requestOtp(phone, clientIp(req));
  return NextResponse.json({ ok: true });
});
