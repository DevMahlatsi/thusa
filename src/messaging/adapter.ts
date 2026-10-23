import { isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import { renderTemplate, type Language, type TemplateKey, type TemplateParams } from "./templates";

export type Channel = "sms" | "whatsapp";

export type TemplateMessage<K extends TemplateKey> = {
  to: string; // E.164
  channel: Channel;
  language: Language;
  template: K;
  params: TemplateParams[K];
};

type RenderedMessage = { to: string; channel: Channel; template: TemplateKey; body: string };

interface MessagingProvider {
  send(message: RenderedMessage): Promise<void>;
}

// ---- Dev outbox stub -------------------------------------------------------
// Messages are kept in memory and shown at /dev/outbox instead of being printed,
// so OTPs never end up in logs. Never available in production.

export type OutboxEntry = RenderedMessage & { sentAt: string };

const globalForOutbox = globalThis as unknown as { thusaOutbox?: OutboxEntry[] };

export function devOutbox(): OutboxEntry[] {
  if (isProduction()) return [];
  globalForOutbox.thusaOutbox ??= [];
  return globalForOutbox.thusaOutbox;
}

const outboxProvider: MessagingProvider = {
  async send(message) {
    const outbox = devOutbox();
    outbox.unshift({ ...message, sentAt: new Date().toISOString() });
    outbox.splice(20);
    logger.info("messaging.stub_sent", { to: message.to, template: message.template, view: "/dev/outbox" });
  },
};

function provider(): MessagingProvider {
  if (process.env.CLICKATELL_API_KEY) {
    // TODO: Clickatell provider once keys exist.
    throw new Error("Clickatell provider not implemented yet");
  }
  if (isProduction()) throw new Error("No messaging provider configured");
  return outboxProvider;
}

/** The only way to message anyone: a fixed template key plus typed parameters. No free text. */
export async function sendTemplate<K extends TemplateKey>(message: TemplateMessage<K>): Promise<void> {
  const body = renderTemplate(message.language, message.template, message.params);
  await provider().send({ to: message.to, channel: message.channel, template: message.template, body });
}
