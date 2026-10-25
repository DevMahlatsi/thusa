// The WhatsApp Cloud API client, its config and the adapter's WhatsApp send. fetch is stubbed; nothing
// here reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppTemplateMessage } from "@/messaging/templates/whatsapp";
import {
  createWhatsAppTemplate,
  listWhatsAppTemplates,
  parseWhatsAppConfig,
  sendWhatsAppTemplate,
  WhatsAppRefusedError,
} from "@/messaging/whatsapp";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const accepted = () =>
  json({ messaging_product: "whatsapp", contacts: [{ input: "27821234567", wa_id: "27821234567" }], messages: [{ id: "wamid.abc" }] }, 200);
const metaError = (code: number, status = 400) =>
  json({ error: { message: "(#131030) Recipient 27821234567 not in allowed list", type: "OAuthException", code, fbtrace_id: "x" } }, status);

const cfg = { accessToken: "test-token", phoneNumberId: "123456789012345", businessAccountId: "987654321098765" };
const message: WhatsAppTemplateMessage = {
  name: "thusa_payment_request_v1",
  language: "en",
  bodyParameters: ["Kopano Crèche", "Lerato", "R1 250.00", "30/10/2026", "THK7Q2M9XA"],
  buttonParameter: "uoJKLysCwhRAHNWAQR4SFa",
  parts: { body: "unused here", footer: "", button: "Pay now", url: "https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa" },
  text: "unused here",
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseWhatsAppConfig", () => {
  it("is off with neither variable, and on with both", () => {
    expect(parseWhatsAppConfig({})).toBeNull();
    expect(parseWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "" })).toBeNull();
    expect(parseWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123456789" })).toEqual({
      accessToken: "t",
      phoneNumberId: "123456789",
      businessAccountId: null,
    });
  });

  it("throws on half a setup rather than quietly sending nothing", () => {
    expect(() => parseWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t" })).toThrow("Set both");
    expect(() => parseWhatsAppConfig({ WHATSAPP_PHONE_NUMBER_ID: "123456789" })).toThrow("Set both");
  });

  it("only takes digits for the ids, since they go into the URL path", () => {
    expect(() => parseWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123/../me" })).toThrow("digits");
    expect(() =>
      parseWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123456789", WHATSAPP_BUSINESS_ACCOUNT_ID: "abc" }),
    ).toThrow("digits");
  });
});

describe("sendWhatsAppTemplate", () => {
  it("posts the template with its body variables and the button's page id, with the token as a bearer token", async () => {
    fetchMock.mockResolvedValueOnce(accepted());
    expect(await sendWhatsAppTemplate(cfg, "+27821234567", message)).toBe("wamid.abc");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789012345/messages");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
    expect(JSON.parse(init?.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "27821234567",
      type: "template",
      template: {
        name: "thusa_payment_request_v1",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: message.bodyParameters.map((text) => ({ type: "text", text })),
          },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "uoJKLysCwhRAHNWAQR4SFa" }] },
        ],
      },
    });
  });

  it("treats a 400 as refused, with only codes in the error, never Meta's text (which echoes the number)", async () => {
    fetchMock.mockResolvedValueOnce(metaError(131030));
    const err = await sendWhatsAppTemplate(cfg, "+27821234567", message).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppRefusedError);
    expect(err.message).toBe("WhatsApp answered 400 (error 131030)");
    expect(err.message).not.toContain("4567");
  });

  it("treats rate limits, Meta's own trouble, a bad token and 5xx as plain failures that may work later", async () => {
    for (const res of [metaError(131056), metaError(130429), metaError(190, 401), new Response("oops", { status: 503 })]) {
      fetchMock.mockResolvedValueOnce(res);
      const err = await sendWhatsAppTemplate(cfg, "+27821234567", message).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(WhatsAppRefusedError);
    }
  });

  it("refuses to call an answer without a message id a success", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [] }, 200));
    await expect(sendWhatsAppTemplate(cfg, "+27821234567", message)).rejects.toThrow("not understood");
  });
});

describe("templates on the business account", () => {
  it("lists only Thusa's templates", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          data: [
            { name: "thusa_payment_request_v1", language: "en", status: "APPROVED", id: "1" },
            { name: "hello_world", language: "en_US", status: "APPROVED", id: "2" },
          ],
        },
        200,
      ),
    );
    expect(await listWhatsAppTemplates(cfg)).toEqual([{ name: "thusa_payment_request_v1", language: "en", status: "APPROVED" }]);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/graph\.facebook\.com\/v23\.0\/987654321098765\/message_templates\?/);
  });

  it("submits a template and returns Meta's status for it", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "t1", status: "PENDING", category: "UTILITY" }, 200));
    const { whatsAppTemplateDefinition } = await import("@/messaging/templates/whatsapp");
    const definition = whatsAppTemplateDefinition("en", "payment_request");
    expect(await createWhatsAppTemplate(cfg, definition)).toBe("PENDING");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toEqual(definition);
  });

  it("needs the business account id", async () => {
    await expect(listWhatsAppTemplates({ ...cfg, businessAccountId: null })).rejects.toThrow("WHATSAPP_BUSINESS_ACCOUNT_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("messaging adapter: WhatsApp", () => {
  async function load(vars: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
    return import("@/messaging/adapter");
  }

  it("sends through Meta once the token and phone number id are set", async () => {
    const adapter = await load({ WHATSAPP_ACCESS_TOKEN: "test-token", WHATSAPP_PHONE_NUMBER_ID: "123456789" });
    fetchMock.mockResolvedValueOnce(accepted());
    expect(adapter.whatsAppEnabled()).toBe(true);
    expect(await adapter.sendWhatsApp("+27821234567", message)).toEqual({ provider: "meta", providerMessageId: "wamid.abc" });
  });

  it("turns a Meta refusal into a MessageRefusedError", async () => {
    const adapter = await load({ WHATSAPP_ACCESS_TOKEN: "test-token", WHATSAPP_PHONE_NUMBER_ID: "123456789" });
    fetchMock.mockResolvedValueOnce(metaError(132001));
    await expect(adapter.sendWhatsApp("+27821234567", message)).rejects.toBeInstanceOf(adapter.MessageRefusedError);
  });

  it("is off without the variables, and a half setup reads as off on pages but throws when sending", async () => {
    let adapter = await load({ WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "" });
    expect(adapter.whatsAppEnabled()).toBe(false);
    expect(adapter.whatsAppConfig()).toBeNull();

    adapter = await load({ WHATSAPP_ACCESS_TOKEN: "test-token", WHATSAPP_PHONE_NUMBER_ID: "" });
    expect(adapter.whatsAppEnabled()).toBe(false);
    await expect(adapter.sendWhatsApp("+27821234567", message)).rejects.toThrow("Set both");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
