import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, clientIp, parseJson } from "@/lib/http";
import { saMobileSchema } from "@/lib/phone";
import { sendWhatsAppSample } from "@/lib/whatsapp-sample";
import { collectionId, type Ctx } from "../collection-id";

// Demo account only: sends this fee's payment request to the WhatsApp number the judge typed in, once
// they agree to get it. Only the number and the agreement: the server decides what the message says.
const bodySchema = z.strictObject(
  {
    phone: saMobileSchema,
    consent: z.literal(true, { error: "Tick the box to agree to get this WhatsApp message." }),
  },
  { error: "Invalid request." },
);

export const POST = apiRoute<Ctx>(async (req, ctx) => {
  const { user, businessId } = await requireBusinessUser(["OWNER", "STAFF"]);
  const id = await collectionId(ctx);
  const { phone } = await parseJson(req, bodySchema);
  const message = await sendWhatsAppSample({ userId: user.id, businessId }, id, phone, clientIp(req));
  return NextResponse.json(
    { message: { id: message.id, status: message.status, note: message.note, phoneMasked: message.phoneMasked } },
    { status: 201 },
  );
});
