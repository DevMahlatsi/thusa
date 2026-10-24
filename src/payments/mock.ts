import { randomUUID } from "node:crypto";
import type { PaymentProvider, PaymentRequestResult } from "./adapter";

// Stand-in provider for dev, tests and a sandbox without Stitch keys. Accepts every request and, like
// a real provider, answers a repeated idempotency key with the first result. No money moves and there
// is no payment page.

const globalForMock = globalThis as unknown as { thusaMockPayments?: Map<string, PaymentRequestResult> };

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
};
