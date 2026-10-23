import { z } from "zod";
import { LANGUAGES } from "@/messaging/templates/types";
import { audit } from "./audit";
import { PROVINCE_CODES } from "./business-options";
import { db } from "./db";
import { HttpError } from "./http";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .optional()
    .transform((v) => v || null);

// Strict: unknown keys (e.g. a smuggled businessId) are rejected, not ignored.
export const businessProfileSchema = z.strictObject({
  name: z.string().trim().min(2, "Enter your business name").max(100, "Business name is too long"),
  town: optionalText(80, "Town"),
  province: z.enum(PROVINCE_CODES, { error: "Choose a province" }),
  ecdRegistrationNumber: optionalText(40, "Registration number").refine(
    (v) => v === null || /^[A-Za-z0-9/\- ]+$/.test(v),
    "Registration number can only contain letters, numbers, / and -",
  ),
  defaultLanguage: z.enum(LANGUAGES).default("en"),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

/** Creates the business and makes this user its OWNER. Only works once per user. */
export async function createBusinessForUser(userId: string, input: BusinessProfileInput) {
  const business = await db().$transaction(async (tx) => {
    const created = await tx.business.create({ data: input });
    const linked = await tx.user.updateMany({
      where: { id: userId, businessId: null },
      data: { businessId: created.id, role: "OWNER" },
    });
    if (linked.count === 0) throw new HttpError(409, "Your business is already set up.");
    return created;
  });
  await audit({ action: "business.created", userId, businessId: business.id });
  return business;
}

export async function getBusiness(businessId: string) {
  return db().business.findUnique({ where: { id: businessId } });
}

export async function updateBusiness(ctx: { userId: string; businessId: string }, input: BusinessProfileInput) {
  const business = await db().business.update({ where: { id: ctx.businessId }, data: input });
  await audit({
    action: "business.updated",
    userId: ctx.userId,
    businessId: ctx.businessId,
    metadata: { fields: Object.keys(input).join(",") },
  });
  return business;
}

export function toBusinessDto(business: NonNullable<Awaited<ReturnType<typeof getBusiness>>>) {
  return {
    name: business.name,
    town: business.town,
    province: business.province,
    ecdRegistrationNumber: business.ecdRegistrationNumber,
    defaultLanguage: business.defaultLanguage,
  };
}
