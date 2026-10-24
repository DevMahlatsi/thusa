// The payments adapter: provider selection, the mock's idempotency, and what we send to Stitch.
// fetch is stubbed; nothing here reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STITCH_ENV = {
  PAYMENTS_PROVIDER: "stitch",
  STITCH_CLIENT_ID: "test-client-id",
  STITCH_CLIENT_SECRET: "test-client-secret", // gitleaks:allow
};

const input = { amountCents: 125_050, reference: "THK7Q2M9XA", idempotencyKey: "key-1", payerName: "Thandi Mokoena" };

// env() caches what it parses, so each test loads fresh modules after setting variables.
async function load(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return import("@/payments/adapter");
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const token = () => json({ success: true, data: { accessToken: "stitch-token" } });
const none = () => json({ success: true, data: { payments: [] } });
const link = (over: object = {}) => ({ id: "link_1", link: "https://express.stitch.money/DjbyqE", status: "PENDING", ...over });
const created = (over: object = {}) => json({ success: true, data: { payment: link(over) } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  delete (globalThis as { thusaStitchToken?: unknown }).thusaStitchToken;
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("paymentProvider", () => {
  it("uses mock in dev when nothing is set", async () => {
    const { paymentProvider } = await load({ PAYMENTS_PROVIDER: "" });
    expect(paymentProvider().name).toBe("mock");
  });

  it("refuses to guess in production", async () => {
    const { paymentProvider } = await load({ PAYMENTS_PROVIDER: "", NODE_ENV: "production" });
    expect(() => paymentProvider()).toThrow(/PAYMENTS_PROVIDER/);
  });

  it("rejects providers that don't exist yet", async () => {
    const { paymentProvider } = await load({ PAYMENTS_PROVIDER: "fnb" });
    expect(() => paymentProvider()).toThrow(/PAYMENTS_PROVIDER/);
  });

  it("names missing Stitch settings without revealing any values", async () => {
    const { paymentProvider } = await load({ ...STITCH_ENV, STITCH_CLIENT_SECRET: "" });
    let message = "";
    try {
      paymentProvider();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/STITCH_CLIENT_SECRET/);
    expect(message).not.toContain("test-client-id");
  });
});

describe("mock provider", () => {
  it("answers a repeated idempotency key with the first result", async () => {
    const { paymentProvider } = await load({ PAYMENTS_PROVIDER: "mock" });
    const first = await paymentProvider().createPaymentRequest(input);
    expect(await paymentProvider().createPaymentRequest(input)).toEqual(first);
    const other = await paymentProvider().createPaymentRequest({ ...input, idempotencyKey: "key-2" });
    expect(other.providerRequestId).not.toBe(first.providerRequestId);
    expect(first.paymentUrl).toBeNull();
  });
});

describe("Stitch Express provider", () => {
  it("creates a payment link in integer cents with our reference", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(none()).mockResolvedValueOnce(created());
    const { paymentProvider } = await load(STITCH_ENV);
    const result = await paymentProvider().createPaymentRequest(input);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe("https://express.stitch.money/api/v1/token");
    expect(JSON.parse(String(tokenInit?.body))).toMatchObject({ clientId: "test-client-id", scope: "client_paymentrequest" });

    const [findUrl] = fetchMock.mock.calls[1]!;
    expect(new URL(String(findUrl)).searchParams.get("merchantReference")).toBe("THK7Q2M9XA");

    const [createUrl, createInit] = fetchMock.mock.calls[2]!;
    expect(createUrl).toBe("https://express.stitch.money/api/v1/payment-links");
    expect(new Headers(createInit?.headers).get("Authorization")).toBe("Bearer stitch-token");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      amount: 125_050,
      payerName: "Thandi Mokoena",
      merchantReference: "THK7Q2M9XA",
    });

    expect(result.providerRequestId).toBe("link_1");
    // Exactly as Stitch gave it: a redirect_url parameter makes Express payment links 404.
    expect(result.paymentUrl).toBe("https://express.stitch.money/DjbyqE");
  });

  it("reuses a link that already has our reference instead of making a second", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json({ success: true, data: { payments: [link()] } }));
    const { paymentProvider } = await load(STITCH_ENV);
    expect((await paymentProvider().createPaymentRequest(input)).providerRequestId).toBe("link_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes a new link when the old one was cancelled or expired", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ success: true, data: { payments: [link({ id: "old", status: "EXPIRED" })] } }))
      .mockResolvedValueOnce(created({ id: "new" }));
    const { paymentProvider } = await load(STITCH_ENV);
    expect((await paymentProvider().createPaymentRequest(input)).providerRequestId).toBe("new");
  });

  it("reuses the access token until it nearly expires", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(none())
      .mockResolvedValueOnce(created())
      .mockResolvedValueOnce(none())
      .mockResolvedValueOnce(created());
    const { paymentProvider } = await load(STITCH_ENV);
    await paymentProvider().createPaymentRequest(input);
    await paymentProvider().createPaymentRequest({ ...input, reference: "THK7Q2M9XB" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(1);
  });

  it("throws on an HTTP error without reading the body", async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, generalErrors: ["bad secret test-client-secret"] }, 400));
    const { paymentProvider } = await load(STITCH_ENV);
    const error = await paymentProvider().createPaymentRequest(input).catch((e: Error) => e);
    expect((error as Error).message).toBe("Stitch answered 400 on POST /api/v1/token");
  });

  it("refuses amounts under R 1.00 before calling Stitch", async () => {
    const { paymentProvider } = await load(STITCH_ENV);
    await expect(paymentProvider().createPaymentRequest({ ...input, amountCents: 99 })).rejects.toThrow(/R 1.00/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never passes on a payment link outside Stitch", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(none())
      .mockResolvedValueOnce(created({ link: "https://express.stitch.money.evil.example/pay" }));
    const { paymentProvider } = await load(STITCH_ENV);
    await expect(paymentProvider().createPaymentRequest(input)).rejects.toThrow(/unexpected payment URL/);
  });

  it.each([
    ["Thandi Mokoena", "Thandi Mokoena"],
    ["Al", "Al (parent)"],
    ["A".repeat(80), "A".repeat(40)],
  ])("fits the payer name %s into Express's 3–40 characters", async (name, sent) => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(none()).mockResolvedValueOnce(created());
    const { paymentProvider } = await load(STITCH_ENV);
    await paymentProvider().createPaymentRequest({ ...input, payerName: name });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).payerName).toBe(sent);
  });
});
