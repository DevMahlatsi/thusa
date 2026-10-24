import { z } from "zod";
import { env } from "@/lib/env";
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult } from "./adapter";

// Stitch Express payment links: Stitch hosts a page where the payer pays by card, Capitec Pay and so on,
// and the money settles to the Express account. REST API, spec: https://express.stitch.money/api/openapi.json
// (not the Enterprise GraphQL API at api.stitch.money).
//
// Express takes no idempotency key for payment links. Our reference is the link's merchantReference, so
// before creating a link we look for one with that reference: a retry after a lost response finds the
// first link instead of making a second. src/lib/collections.ts also keeps one call in flight per
// collection and never calls again once a request id is stored.

const BASE_URL = "https://express.stitch.money";
const TIMEOUT_MS = 10_000;
// Tokens last 15 minutes; refresh a minute early.
const TOKEN_LIFE_MS = 14 * 60_000;
// Express rejects payment links below R 1.00.
const MIN_AMOUNT_CENTS = 100;

const configSchema = z.object({
  STITCH_CLIENT_ID: z.string().min(1),
  STITCH_CLIENT_SECRET: z.string().min(1),
});

type Config = z.infer<typeof configSchema>;

function config(): Config {
  const parsed = configSchema.safeParse(env());
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Stitch is not configured: ${names} (see .env.example)`);
  }
  return parsed.data;
}

const tokenSchema = z.object({ data: z.object({ accessToken: z.string().min(1) }) });
const linkSchema = z.object({ id: z.string().min(1), link: z.url(), status: z.string() });
const createdSchema = z.object({ data: z.object({ payment: linkSchema }) });
const foundSchema = z.object({ data: z.object({ payments: z.array(linkSchema) }) });

const globalForStitch = globalThis as unknown as { thusaStitchToken?: { value: string; expiresAt: number } };

async function call(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Only the status: Stitch's error bodies can echo what we sent.
  if (!res.ok) throw new Error(`Stitch answered ${res.status} on ${init.method} ${path.split("?")[0]}`);
  return res.json();
}

async function accessToken(cfg: Config): Promise<string> {
  const cached = globalForStitch.thusaStitchToken;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const parsed = tokenSchema.safeParse(
    await call("/api/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: cfg.STITCH_CLIENT_ID, clientSecret: cfg.STITCH_CLIENT_SECRET, scope: "client_paymentrequest" }),
    }),
  );
  if (!parsed.success) throw new Error("Stitch token response was not understood");
  globalForStitch.thusaStitchToken = { value: parsed.data.data.accessToken, expiresAt: Date.now() + TOKEN_LIFE_MS };
  return parsed.data.data.accessToken;
}

/** Express wants 3–40 characters. Our names can be 1–80. */
function stitchPayerName(name: string): string {
  return (name.length >= 3 ? name : `${name} (parent)`).slice(0, 40).trim();
}

/**
 * We show this link to owners, so only ever a Stitch page over https. No return address: appending
 * `?redirect_url=` (as Express documents for consents and subscriptions) makes payment links 404, even
 * with a registered URL, so payers finish on Stitch's own page until the right way is confirmed.
 */
function checkedLink(link: string): string {
  const url = new URL(link);
  if (url.protocol !== "https:" || !(url.hostname === "stitch.money" || url.hostname.endsWith(".stitch.money"))) {
    throw new Error("Stitch returned an unexpected payment URL");
  }
  return url.toString();
}

async function createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
  if (input.amountCents < MIN_AMOUNT_CENTS) throw new Error("Stitch needs at least R 1.00");
  const cfg = config();
  const auth = { Authorization: `Bearer ${await accessToken(cfg)}` };

  const query = new URLSearchParams({ merchantReference: input.reference, limit: "1" });
  const found = foundSchema.safeParse(await call(`/api/v1/payment-links?${query}`, { method: "GET", headers: auth }));
  if (!found.success) throw new Error("Stitch response was not understood");
  let link = found.data.data.payments.find((p) => p.status !== "CANCELLED" && p.status !== "EXPIRED");

  if (!link) {
    const created = createdSchema.safeParse(
      await call("/api/v1/payment-links", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Integer cents, as Express expects.
          amount: input.amountCents,
          payerName: stitchPayerName(input.payerName),
          merchantReference: input.reference,
        }),
      }),
    );
    if (!created.success) throw new Error("Stitch response was not understood");
    link = created.data.data.payment;
  }
  return { providerRequestId: link.id, paymentUrl: checkedLink(link.link) };
}

/** Throws if the Stitch settings are missing or invalid, so a bad deploy fails on the first request. */
export function stitchProvider(): PaymentProvider {
  config();
  return { name: "stitch", createPaymentRequest };
}
