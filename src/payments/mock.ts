import { createHmac, randomUUID } from "node:crypto";
import { env, isProduction } from "@/lib/env";
import type { ConfirmedPayment, PaymentProvider, PaymentRequestResult } from "./adapter";
import { svixHeaders, verifySvix, WebhookSignatureError } from "./svix";

// Stand-in provider for dev, tests and a sandbox without Stitch keys. Accepts every request and, like
// a real provider, answers a repeated idempotency key with the first result. No money moves and there
// is no payment page. In dev, simulatePayment stands in for a parent paying: it signs a webhook the
// same way Stitch's (Svix) are signed, so the whole webhook path runs. Mock webhooks are refused in
// production, where nothing can really have been paid.

const globalForMock = globalThis as unknown as {
  thusaMockPayments?: Map<string, PaymentRequestResult>;
  thusaMockPaid?: Map<string, ConfirmedPayment>;
};

// Derived from SESSION_SECRET so it isn't in the code and needs no extra variable.
function webhookSecret(): string {
  const derived = createHmac("sha256", env().SESSION_SECRET).update("thusa-mock-webhook").digest("base64");
  return `whsec_${derived}`;
}

function assertNotProduction() {
  if (isProduction()) throw new WebhookSignatureError("Mock payments are off in production");
}

type SimulatedPayment = { providerRequestId: string; amountCents: number; reference: string };

/** Dev and tests only: marks a mock request paid and returns the signed webhook that would announce it. */
export function simulatePayment(payment: SimulatedPayment, paidAt = new Date()) {
  assertNotProduction();
  const paid = (globalForMock.thusaMockPaid ??= new Map());
  paid.set(payment.providerRequestId, {
    amountCents: payment.amountCents,
    reference: payment.reference,
    providerPaymentId: `mockpay_${payment.providerRequestId}`,
    paidAt,
  });
  const rawBody = JSON.stringify({ type: "payment.paid", requestId: payment.providerRequestId });
  return { rawBody, headers: svixHeaders(webhookSecret(), `mock-${randomUUID()}`, rawBody) };
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createPaymentRequest({ idempotencyKey }) {
    const seen = (globalForMock.thusaMockPayments ??= new Map());
    let result = seen.get(idempotencyKey);
    if (!result) {
      result = { providerRequestId: `mock_${randomUUID()}`, paymentUrl: null };
      seen.set(idempotencyKey, result);
    }
    return result;
  },
  parseWebhook(rawBody, headers) {
    assertNotProduction();
    const eventId = verifySvix(webhookSecret(), rawBody, headers);
    let body: { type?: unknown; requestId?: unknown } = {};
    try {
      body = JSON.parse(rawBody);
    } catch {}
    const paidRequestId = body.type === "payment.paid" && typeof body.requestId === "string" ? body.requestId : null;
    return { eventId, paidRequestId };
  },
  async confirmPayment(providerRequestId) {
    return globalForMock.thusaMockPaid?.get(providerRequestId) ?? null;
  },
};
