// Structured logger that masks PII. Use this instead of console.* everywhere in the app.

const SENSITIVE_KEY = /phone|msisdn|otp|code|token|secret|password|pin|account|cookie|authorization|idnumber/i;

// Runs of 6+ digits (optionally with spaces, dashes or a leading +) look like phone/account numbers or codes.
const DIGIT_RUN = /\+?\d[\d\s-]{4,}\d/g;

export function mask(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export function maskDigitsInText(text: string): string {
  return text.replace(DIGIT_RUN, (match) => (match.replace(/\D/g, "").length >= 6 ? mask(match) : match));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return maskDigitsInText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: maskDigitsInText(value.message) };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? mask(v) : redact(v, depth + 1)]),
    );
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, event: string, meta?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({
    level,
    event: maskDigitsInText(event),
    time: new Date().toISOString(),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => write("debug", event, meta),
  info: (event: string, meta?: Record<string, unknown>) => write("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => write("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => write("error", event, meta),
};
