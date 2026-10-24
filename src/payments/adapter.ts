import { env, isProduction } from "@/lib/env";
import type { PaymentLink } from "@/messaging/templates/types";
import { mockProvider } from "./mock";
import { stitchProvider } from "./stitch";

export { WebhookSignatureError } from "./svix";

// The only way the app talks to a payment provider. Everything outside src/payments/ uses these types;
// Stitch (and later FNB) specifics never leave this folder.

export const PROVIDERS = ["mock", "stitch"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export type PaymentRequestInput = {
  amountCents: number;
  // Ours, unique per collection. Used to find and match the payment at the provider.
  reference: string;
  // The same for every retry of one collection, so a retry can't become a second payment.
  idempotencyKey: string;
  // Shown on the provider's payment page. The parent's name: never their phone number.
  payerName: string;
};

export type PaymentRequestResult = {
  providerRequestId: string;
  // Where the payer pays. Null when the provider has no payment page (mock).
  paymentUrl: string | null;
};

/** A webhook whose signature checked out. Its contents are only a hint: confirmPayment decides. */
export type PaymentEvent = {
  // The delivery's id, the same on every retry. For dedupe.
  eventId: string;
  // Set when the event says a payment request was paid; null for anything we don't act on.
  paidRequestId: string | null;
};

/** What the provider's own API says about a paid request, asked for directly rather than trusted from a webhook. */
export type ConfirmedPayment = {
  amountCents: number;
  // Our reference as the provider holds it, to check the request is really this collection's.
  reference: string;
  // Unique per payment at the provider, so one payment is never credited twice.
  providerPaymentId: string;
  paidAt: Date;
};

export interface PaymentProvider {
  readonly name: ProviderName;
  createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  /** Verifies the signature over the raw body before reading anything. Throws WebhookSignatureError. */
  parseWebhook(rawBody: string, headers: Headers): PaymentEvent;
  /** The payment for a request, or null if the provider doesn't (yet) say it is paid. */
  confirmPayment(providerRequestId: string): Promise<ConfirmedPayment | null>;
}

// Hosts whose payment pages may appear in a message to a parent. Each provider's page lives on its own
// domain over https; any other URL is left out of the message.
const PAYMENT_PAGE_HOSTS = ["stitch.money"];

/** A stored payment URL as a link a message template accepts, or null if it isn't a provider's payment page. */
export function paymentLink(url: string | null): PaymentLink | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  const allowed = PAYMENT_PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (parsed.protocol !== "https:" || !allowed || parsed.username || parsed.password) return null;
  return parsed.toString() as PaymentLink;
}

/** The configured provider. Throws in production when none is set, rather than quietly using mock. */
export function paymentProvider(): PaymentProvider {
  const name = env().PAYMENTS_PROVIDER || (isProduction() ? undefined : "mock");
  if (name === "stitch") return stitchProvider();
  if (name === "mock") return mockProvider;
  throw new Error("PAYMENTS_PROVIDER must be mock or stitch (see .env.example)");
}
