export const LANGUAGES = ["en", "zu", "st", "tn"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * A payment page URL that a payment provider gave us and that passed its checks (https, the provider's
 * own host). Only `paymentLink` in src/payments/adapter.ts makes one, so a template can never carry a
 * free-text link.
 */
export type PaymentLink = string & { readonly __brand: "PaymentLink" };

/** One fee, as a parent sees it. Amounts in integer cents; the template formats them. */
export type FeeParams = {
  business: string;
  child: string;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  reference: string;
  // Null when the provider has no payment page (mock): the message gives the reference instead.
  link: PaymentLink | null;
};

// Every template and its parameters. Adding a key here forces all four languages to implement it.
export type TemplateParams = {
  otp: { code: string; minutes: number };
  payment_request: FeeParams;
  payment_reminder: FeeParams;
  // amountCents is the balance still owed; paidCents what the parent has paid so far.
  balance_request: FeeParams & { paidCents: number };
};

export type TemplateKey = keyof TemplateParams;

export type TemplateSet = { [K in TemplateKey]: (params: TemplateParams[K]) => string };
