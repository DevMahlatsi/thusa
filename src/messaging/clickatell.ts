import { z } from "zod";

// Clickatell One API, SMS channel. POST /v1/message with the integration's API key in the Authorization
// header (no "Bearer"); 202 means accepted, with one result per message. Reference:
// https://help.clickatell.com/developers-api-reference/reference/one-api.md
//
// While the account is in sandbox (trial) mode Clickatell only delivers to the test phones registered in
// its portal, and every other number is refused.

const URL = "https://platform.clickatell.com/v1/message";
const TIMEOUT_MS = 10_000;

/** Clickatell turned this message down (bad number, not a test phone, no credit). Retrying won't help. */
export class ClickatellRefusedError extends Error {}

const responseSchema = z.object({
  messages: z
    .array(
      z.object({
        apiMessageId: z.string().nullish(),
        accepted: z.boolean(),
        error: z.object({ code: z.union([z.number(), z.string()]).nullish() }).nullish(),
      }),
    )
    .optional(),
  error: z.object({ code: z.union([z.number(), z.string()]).nullish() }).nullish(),
});

/**
 * Sends one SMS and returns Clickatell's message id. `to` is E.164 (+27...). Errors carry only status
 * codes and Clickatell's error code, never their text, which can echo the number or the message.
 */
export async function sendClickatellSms(apiKey: string, to: string, content: string): Promise<string | null> {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json", Accept: "application/json" },
    // One API wants the number in international format without the "+".
    body: JSON.stringify({ messages: [{ channel: "sms", to: to.replace(/^\+/, ""), content }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  const result = parsed.success ? parsed.data.messages?.[0] : undefined;

  if (res.status === 202 && result?.accepted) return result.apiMessageId ?? null;
  const code = result?.error?.code ?? (parsed.success ? parsed.data.error?.code : undefined);
  const detail = `Clickatell answered ${res.status}${code != null ? ` (error ${code})` : ""}`;
  // 400 (bad message or number) and 402 (no credit) won't change on retry; 401 and 5xx might.
  if (res.status === 202 || res.status === 207 || res.status === 400 || res.status === 402) {
    throw new ClickatellRefusedError(detail);
  }
  throw new Error(detail);
}
