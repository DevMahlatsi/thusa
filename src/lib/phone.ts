import { z } from "zod";

/**
 * Normalises a South African mobile number to E.164 (+27XXXXXXXXX).
 * Accepts 082 123 4567, 0821234567, 27821234567 and +27 82 123 4567.
 * Returns null for anything that isn't an SA mobile number (prefixes 6, 7, 8).
 */
export function normaliseSaMobile(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+27\d{9}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^27\d{9}$/.test(cleaned)) national = cleaned.slice(2);
  else if (/^0\d{9}$/.test(cleaned)) national = cleaned.slice(1);
  else return null;
  return /^[678]\d{8}$/.test(national) ? `+27${national}` : null;
}

export const saMobileSchema = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    const phone = normaliseSaMobile(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a South African cellphone number, e.g. 082 123 4567" });
      return z.NEVER;
    }
    return phone;
  });
