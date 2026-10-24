import { env, isProduction } from "@/lib/env";
import { mockProvider } from "./mock";
import { stitchProvider } from "./stitch";

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

export interface PaymentProvider {
  readonly name: ProviderName;
  createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult>;
}

/** The configured provider. Throws in production when none is set, rather than quietly using mock. */
export function paymentProvider(): PaymentProvider {
  const name = env().PAYMENTS_PROVIDER || (isProduction() ? undefined : "mock");
  if (name === "stitch") return stitchProvider();
  if (name === "mock") return mockProvider;
  throw new Error("PAYMENTS_PROVIDER must be mock or stitch (see .env.example)");
}
