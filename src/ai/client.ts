import { z } from "zod";

// The only code that calls OpenAI: the Responses API, plain fetch, no SDK. One attempt with an 8 s timeout
// and no retries, so the page never waits long. Errors carry a short reason only, never OpenAI's text or
// ours. The key is never logged. Reference: https://platform.openai.com/docs/api-reference/responses

const RESPONSES_URL = "https://api.openai.com/v1/responses";
export const TIMEOUT_MS = 8_000;
// Reasoning tokens count towards this; too low comes back "incomplete" with no text.
export const MAX_OUTPUT_TOKENS = 1_500;
export const DEFAULT_MODEL = "gpt-5.6-luna";
export const REASONING_EFFORTS = ["low", "medium"] as const;

export type AiConfig = { apiKey: string; model: string; effort: (typeof REASONING_EFFORTS)[number] };

/** Why there's no AI text. The same words go in the logs. */
export type AiFailure =
  | "disabled"
  | "no_key"
  | "bad_config"
  | "timeout"
  | "network"
  | `http_${number}`
  | "incomplete"
  | "bad_response"
  | "empty";

export class AiRequestError extends Error {
  constructor(readonly reason: AiFailure) {
    super(`OpenAI request failed: ${reason}`);
  }
}

/**
 * The AI settings from the environment. Off unless AI_SUMMARY_ENABLED is exactly "true" and there is a
 * key. A bad model name or effort is reported as bad_config rather than thrown, so a typo in the settings
 * can never break the dashboard: it just shows the rule-based summary.
 */
export function parseAiConfig(source: Record<string, string | undefined>): { config: AiConfig } | { reason: AiFailure } {
  if (source.AI_SUMMARY_ENABLED !== "true") return { reason: "disabled" };
  const apiKey = source.OPENAI_API_KEY?.trim();
  if (!apiKey) return { reason: "no_key" };
  const model = source.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const effort = z.enum(REASONING_EFFORTS).safeParse(source.OPENAI_REASONING_EFFORT?.trim() || "low");
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(model) || !effort.success) return { reason: "bad_config" };
  return { config: { apiKey, model, effort: effort.data } };
}

// AbortSignal.timeout rejects with a DOMException named TimeoutError.
const isTimeout = (err: unknown) => (err as { name?: unknown } | null)?.name === "TimeoutError";

const responseSchema = z.object({
  status: z.string(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .default([]),
});

/**
 * Sends `instructions` and `input` and returns the reply's text: the output_text parts of its message
 * items, joined (the REST answer has no output_text field; that's an SDK helper). A refusal has no
 * output_text, so it comes back as "empty".
 */
export async function createResponse(cfg: AiConfig, request: { instructions: string; input: string }): Promise<string> {
  let res: Response;
  try {
    res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        instructions: request.instructions,
        input: request.input,
        // Always sent: the model's own default is medium, which is slower and costs more.
        reasoning: { effort: cfg.effort },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Don't keep the request or answer on OpenAI's side.
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AiRequestError(isTimeout(err) ? "timeout" : "network");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    // The timeout also covers reading the body.
    if (isTimeout(err)) throw new AiRequestError("timeout");
    body = null;
  }
  if (!res.ok) throw new AiRequestError(`http_${res.status}`);

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new AiRequestError("bad_response");
  if (parsed.data.status === "incomplete") throw new AiRequestError("incomplete");
  if (parsed.data.status !== "completed") throw new AiRequestError("bad_response");
  const text = parsed.data.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
  if (!text.trim()) throw new AiRequestError("empty");
  return text;
}
