import { z } from "zod";
import { normaliseSaMobile } from "../phone";

/**
 * Judges' demo login (hackathon only). When DEMO_PHONE and DEMO_OTP are both set, that one number
 * always gets DEMO_OTP as its login code and no SMS is sent. Every other number is unaffected.
 * The code still goes through the normal challenge (hashed, 5-min expiry, single use, 3 attempts).
 */
export type DemoLogin = { phoneE164: string; code: string };

const demoSchema = z.object({
  DEMO_PHONE: z.string().transform((v, ctx) => normaliseSaMobile(v) ?? (ctx.addIssue({ code: "custom" }), z.NEVER)),
  DEMO_OTP: z.string().regex(/^\d{6}$/),
});

export function parseDemoLogin(source: Record<string, string | undefined>): DemoLogin | null {
  if (!source.DEMO_PHONE && !source.DEMO_OTP) return null;
  const parsed = demoSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Invalid demo login configuration: set DEMO_PHONE (SA mobile) and DEMO_OTP (6 digits) together");
  }
  return { phoneE164: parsed.data.DEMO_PHONE, code: parsed.data.DEMO_OTP };
}

// Read on every call (not cached) so it can be switched off by removing the env vars.
export const demoLogin = () => parseDemoLogin(process.env);

/** +27600000000 -> "060 000 0000" */
export function formatSaMobile(phoneE164: string): string {
  const n = `0${phoneE164.slice(3)}`;
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
