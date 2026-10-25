import { isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ClickatellRefusedError, sendClickatellSms } from "./clickatell";
import { MAX_SMS_PARTS, smsParts, toGsm } from "./sms";
import { renderTemplate, type Language, type TemplateKey, type TemplateParams } from "./templates";
import type { WhatsAppTemplateMessage } from "./templates/whatsapp";
import { parseWhatsAppConfig, sendWhatsAppTemplate, WhatsAppRefusedError, type WhatsAppConfig } from "./whatsapp";

export type Channel = "sms" | "whatsapp";

export type TemplateMessage<K extends TemplateKey> = {
  to: string; // E.164
  channel: Channel;
  language: Language;
  template: K;
  params: TemplateParams[K];
};

/** Text made from a fixed template by renderMessage. Nothing else can be sent. */
export type RenderedBody = string & { readonly __brand: "RenderedBody" };

type RenderedMessage = { to: string; channel: Channel; template: TemplateKey; body: RenderedBody };

export type ProviderName = "clickatell" | "meta" | "outbox";

export type SendResult = { provider: ProviderName; providerMessageId: string | null };

/** The provider refused the message (or it is too long to send). Sending it again won't help. */
export class MessageRefusedError extends Error {}

interface MessagingProvider {
  readonly name: ProviderName;
  send(message: RenderedMessage): Promise<string | null>;
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
  name: "outbox",
  async send(message) {
    const outbox = devOutbox();
    outbox.unshift({ ...message, sentAt: new Date().toISOString() });
    outbox.splice(20);
    logger.info("messaging.stub_sent", { to: message.to, template: message.template, view: "/dev/outbox" });
    return null;
  },
};

function clickatellProvider(apiKey: string): MessagingProvider {
  return {
    name: "clickatell",
    async send(message) {
      if (message.channel !== "sms") throw new MessageRefusedError("Only SMS is set up with Clickatell");
      try {
        return await sendClickatellSms(apiKey, message.to, message.body);
      } catch (err) {
        if (err instanceof ClickatellRefusedError) throw new MessageRefusedError(err.message);
        throw err;
      }
    },
  };
}

/** Which provider would deliver an SMS right now, or null when none is set up (production without keys). */
export function messagingProviderName(): ProviderName | null {
  if (process.env.CLICKATELL_API_KEY) return "clickatell";
  return isProduction() ? null : "outbox";
}

function provider(): MessagingProvider {
  const apiKey = process.env.CLICKATELL_API_KEY;
  if (apiKey) return clickatellProvider(apiKey);
  if (isProduction()) throw new Error("No messaging provider configured");
  return outboxProvider;
}

/** Renders a fixed template, folded into the GSM alphabet so an SMS costs as few parts as possible. */
export function renderMessage<K extends TemplateKey>(language: Language, template: K, params: TemplateParams[K]): RenderedBody {
  return toGsm(renderTemplate(language, template, params)) as RenderedBody;
}

/** Sends text from renderMessage. Throws MessageRefusedError for a message that can never go out. */
export async function sendRendered(message: RenderedMessage): Promise<SendResult> {
  if (message.channel === "sms" && smsParts(message.body) > MAX_SMS_PARTS) {
    throw new MessageRefusedError(`Message needs more than ${MAX_SMS_PARTS} SMS parts`);
  }
  const p = provider();
  return { provider: p.name, providerMessageId: await p.send(message) };
}

/** The only way to message anyone: a fixed template key plus typed parameters. No free text. */
export async function sendTemplate<K extends TemplateKey>(message: TemplateMessage<K>): Promise<SendResult> {
  const body = renderMessage(message.language, message.template, message.params);
  return sendRendered({ to: message.to, channel: message.channel, template: message.template, body });
}

// ---- WhatsApp (Meta Cloud API) -----------------------------------------------------------------------
// Only approved templates (src/messaging/templates/whatsapp.ts), so it carries fee messages to parents,
// never login codes. There's no dev stub: without the env vars, parents' messages go by SMS as before.

/** WhatsApp Cloud API settings, or null when WhatsApp isn't switched on. Half a setup throws. */
export const whatsAppConfig = (): WhatsAppConfig | null => parseWhatsAppConfig(process.env);

/** For pages deciding what to show: a half setup counts as off here, so a page never breaks over it. */
export function whatsAppEnabled(): boolean {
  try {
    return whatsAppConfig() !== null;
  } catch {
    return false;
  }
}

/** Sends an approved WhatsApp template. Throws MessageRefusedError for a message that can never go out. */
export async function sendWhatsApp(to: string, message: WhatsAppTemplateMessage): Promise<SendResult> {
  const cfg = whatsAppConfig();
  if (!cfg) throw new Error("WhatsApp isn't switched on");
  try {
    return { provider: "meta", providerMessageId: await sendWhatsAppTemplate(cfg, to, message) };
  } catch (err) {
    if (err instanceof WhatsAppRefusedError) throw new MessageRefusedError(err.message);
    throw err;
  }
}
