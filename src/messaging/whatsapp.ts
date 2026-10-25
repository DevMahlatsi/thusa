import { z } from "zod";
import type { WhatsAppTemplateDefinition, WhatsAppTemplateMessage } from "./templates/whatsapp";

// WhatsApp Cloud API (Meta), template messages only. POST /{phone number id}/messages with a system user's
// token as a bearer token; 200 means Meta accepted it. Whether it reached the phone comes later, as a
// status webhook, which Thusa doesn't listen to yet. Reference:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages

const GRAPH_URL = "https://graph.facebook.com/v23.0";
const TIMEOUT_MS = 10_000;

export type WhatsAppConfig = { accessToken: string; phoneNumberId: string; businessAccountId: string | null };

// Ids go into the URL path, so only digits.
const idSchema = z.string().regex(/^\d{5,25}$/);

/**
 * The Cloud API settings from the environment, or null when WhatsApp isn't set up. Half a setup (a
 * token without a phone number id, or the other way round) throws rather than quietly sending nothing.
 */
export function parseWhatsAppConfig(source: Record<string, string | undefined>): WhatsAppConfig | null {
  const accessToken = source.WHATSAPP_ACCESS_TOKEN || undefined;
  const phoneNumberId = source.WHATSAPP_PHONE_NUMBER_ID || undefined;
  const businessAccountId = source.WHATSAPP_BUSINESS_ACCOUNT_ID || undefined;
  if (!accessToken && !phoneNumberId) return null;
  if (!accessToken || !phoneNumberId) {
    throw new Error("Set both WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID, or neither (see .env.example)");
  }
  if (!idSchema.safeParse(phoneNumberId).success) throw new Error("WHATSAPP_PHONE_NUMBER_ID must be digits");
  if (businessAccountId && !idSchema.safeParse(businessAccountId).success) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID must be digits");
  }
  return { accessToken, phoneNumberId, businessAccountId: businessAccountId ?? null };
}

/** Meta turned this message down (bad number, template not approved, no payment method). Retrying won't help. */
export class WhatsAppRefusedError extends Error {}

const errorSchema = z.object({
  error: z.object({ code: z.number().nullish(), error_subcode: z.number().nullish() }).nullish(),
});

// Error codes that come back as 400 but can work on a later try: rate limits and Meta's own trouble.
// https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
const RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056, 133004]);

async function graph(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH_URL}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = await res.json().catch(() => null);
  return { res, body };
}

/**
 * Only the HTTP status and Meta's error codes, never Meta's text, which can echo the number. 400s are
 * refusals unless the code says try again; 401, 403, 429 and 5xx might work later.
 */
function failure(status: number, body: unknown): Error {
  const parsed = errorSchema.safeParse(body);
  const code = parsed.success ? parsed.data.error?.code : undefined;
  const subcode = parsed.success ? parsed.data.error?.error_subcode : undefined;
  const detail = `WhatsApp answered ${status}${code != null ? ` (error ${code}${subcode != null ? `/${subcode}` : ""})` : ""}`;
  if (status === 400 && (code == null || !RETRYABLE_CODES.has(code))) return new WhatsAppRefusedError(detail);
  return new Error(detail);
}

const sentSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });

/** Sends one approved template to `to` (E.164, +27...) and returns Meta's message id (wamid…). */
export async function sendWhatsAppTemplate(cfg: WhatsAppConfig, to: string, message: WhatsAppTemplateMessage): Promise<string> {
  const { res, body } = await graph(`${cfg.phoneNumberId}/messages`, cfg.accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: message.name,
        language: { code: message.language },
        components: [
          { type: "body", parameters: message.bodyParameters.map((text) => ({ type: "text", text })) },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: message.buttonParameter }] },
        ],
      },
    }),
  });
  const sent = sentSchema.safeParse(body);
  if (res.ok && sent.success) return sent.data.messages[0]!.id;
  if (res.ok) throw new Error("WhatsApp response was not understood");
  throw failure(res.status, body);
}

const templatesSchema = z.object({
  data: z.array(z.object({ name: z.string(), language: z.string(), status: z.string() })),
});

export type WhatsAppTemplateStatus = { name: string; language: string; status: string };

function businessAccount(cfg: WhatsAppConfig): string {
  if (!cfg.businessAccountId) throw new Error("Set WHATSAPP_BUSINESS_ACCOUNT_ID to manage templates");
  return cfg.businessAccountId;
}

/** Thusa's templates on the WhatsApp Business Account and Meta's review status for each (APPROVED, PENDING, REJECTED…). */
export async function listWhatsAppTemplates(cfg: WhatsAppConfig): Promise<WhatsAppTemplateStatus[]> {
  const query = new URLSearchParams({ fields: "name,language,status", limit: "200" });
  const { res, body } = await graph(`${businessAccount(cfg)}/message_templates?${query}`, cfg.accessToken);
  const parsed = templatesSchema.safeParse(body);
  if (res.ok && parsed.success) return parsed.data.data.filter((t) => t.name.startsWith("thusa_"));
  if (res.ok) throw new Error("WhatsApp response was not understood");
  throw failure(res.status, body);
}

/** Submits one template for Meta's review. Returns Meta's status for it (usually PENDING, sometimes APPROVED at once). */
export async function createWhatsAppTemplate(cfg: WhatsAppConfig, definition: WhatsAppTemplateDefinition): Promise<string> {
  const { res, body } = await graph(`${businessAccount(cfg)}/message_templates`, cfg.accessToken, {
    method: "POST",
    body: JSON.stringify(definition),
  });
  const parsed = z.object({ status: z.string() }).safeParse(body);
  if (res.ok && parsed.success) return parsed.data.status;
  if (res.ok) throw new Error("WhatsApp response was not understood");
  throw failure(res.status, body);
}
