import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Optional here so pages that never touch payer data still work; field-crypto.ts checks it on use.
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  CLICKATELL_API_KEY: z.string().optional(),
  // WhatsApp Cloud API: checked by src/messaging/whatsapp.ts on use (both or neither).
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  // Payments: checked by src/payments/ on use, so the rest of the app runs without them.
  PAYMENTS_PROVIDER: z.string().optional(),
  STITCH_CLIENT_ID: z.string().optional(),
  STITCH_CLIENT_SECRET: z.string().optional(),
  STITCH_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  // Vercel Cron sends it as a bearer token to /api/cron/daily. Unset: the daily job refuses to run.
  CRON_SECRET: z.string().optional(),
  // AI summary: checked by src/ai/client.ts on use, so a typo there never stops the app.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_REASONING_EFFORT: z.string().optional(),
  AI_SUMMARY_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

// Parsed lazily so `next build` and unit tests don't need every variable set.
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid environment configuration: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === "production";
