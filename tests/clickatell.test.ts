// The Clickatell provider and the messaging adapter's provider choice. fetch is stubbed; nothing here
// reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClickatellRefusedError, sendClickatellSms } from "@/messaging/clickatell";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const accepted = () => json({ messages: [{ apiMessageId: "abc123", accepted: true, to: "27821234567", error: null }], error: null }, 202);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendClickatellSms", () => {
  it("posts one SMS to the One API with the key as the Authorization header and the number without +", async () => {
    fetchMock.mockResolvedValueOnce(accepted());
    expect(await sendClickatellSms("test-api-key", "+27821234567", "Hello")).toBe("abc123");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://platform.clickatell.com/v1/message");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("test-api-key");
    expect(JSON.parse(init?.body as string)).toEqual({ messages: [{ channel: "sms", to: "27821234567", content: "Hello" }] });
  });

  it("treats a message Clickatell didn't accept as refused, with only codes in the error", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ messages: [{ apiMessageId: null, accepted: false, to: "27821234567", error: { code: 114, description: "Cannot route to 27821234567" } }] }, 202),
    );
    const err = await sendClickatellSms("k", "+27821234567", "Hello").catch((e) => e);
    expect(err).toBeInstanceOf(ClickatellRefusedError);
    expect(err.message).toBe("Clickatell answered 202 (error 114)");
    expect(err.message).not.toContain("4567");
  });

  it("treats no credit (402) and a bad request (400) as refused", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 301, description: "No credit" } }, 402));
    await expect(sendClickatellSms("k", "+27821234567", "Hello")).rejects.toBeInstanceOf(ClickatellRefusedError);
    fetchMock.mockResolvedValueOnce(json({}, 400));
    await expect(sendClickatellSms("k", "+27821234567", "Hello")).rejects.toBeInstanceOf(ClickatellRefusedError);
  });

  it("treats a server error or a bad key as a plain failure, not a refusal", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }));
    const err = await sendClickatellSms("k", "+27821234567", "Hello").catch((e) => e);
    expect(err).not.toBeInstanceOf(ClickatellRefusedError);
    expect(err.message).toBe("Clickatell answered 503");
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await sendClickatellSms("k", "+27821234567", "Hello").catch((e) => e)).not.toBeInstanceOf(ClickatellRefusedError);
  });
});

describe("messaging adapter", () => {
  async function load(vars: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
    return import("@/messaging/adapter");
  }

  const otp = { to: "+27821234567", channel: "sms", language: "en", template: "otp", params: { code: "048213", minutes: 5 } } as const;

  it("sends through Clickatell once its key is set", async () => {
    const adapter = await load({ CLICKATELL_API_KEY: "test-api-key" });
    fetchMock.mockResolvedValueOnce(accepted());
    expect(adapter.messagingProviderName()).toBe("clickatell");
    expect(await adapter.sendTemplate(otp)).toEqual({ provider: "clickatell", providerMessageId: "abc123" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the dev outbox without a key outside production, and nothing in production", async () => {
    let adapter = await load({ CLICKATELL_API_KEY: "" });
    expect(adapter.messagingProviderName()).toBe("outbox");
    expect(await adapter.sendTemplate(otp)).toEqual({ provider: "outbox", providerMessageId: null });
    expect(fetchMock).not.toHaveBeenCalled();

    adapter = await load({ CLICKATELL_API_KEY: "", NODE_ENV: "production" });
    expect(adapter.messagingProviderName()).toBeNull();
    await expect(adapter.sendTemplate(otp)).rejects.toThrow("No messaging provider configured");
  });

  it("refuses a message longer than the SMS part limit before it reaches the provider", async () => {
    const adapter = await load({ CLICKATELL_API_KEY: "test-api-key" });
    const body = "a".repeat(153 * 3 + 1) as Parameters<typeof adapter.sendRendered>[0]["body"];
    await expect(adapter.sendRendered({ to: "+27821234567", channel: "sms", template: "otp", body })).rejects.toBeInstanceOf(
      adapter.MessageRefusedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a Clickatell refusal into a MessageRefusedError", async () => {
    const adapter = await load({ CLICKATELL_API_KEY: "test-api-key" });
    fetchMock.mockResolvedValueOnce(json({}, 402));
    await expect(adapter.sendTemplate(otp)).rejects.toBeInstanceOf(adapter.MessageRefusedError);
  });
});
