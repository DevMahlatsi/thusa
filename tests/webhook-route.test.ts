// The webhook route hands the exact raw body to the handler and refuses oversized ones.
import { afterEach, describe, expect, it, vi } from "vitest";

const handlePaymentWebhook = vi.fn();
vi.mock("@/lib/payment-webhooks", () => ({ handlePaymentWebhook }));

const { POST } = await import("@/app/api/webhooks/payments/route");

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://mythusa.vercel.app/api/webhooks/payments", { method: "POST", body, headers });

afterEach(() => handlePaymentWebhook.mockReset());

describe("POST /api/webhooks/payments", () => {
  it("passes the raw body through byte for byte, with no same-origin check", async () => {
    handlePaymentWebhook.mockResolvedValueOnce({ status: 200, body: { ok: true, outcome: "processed" } });
    const body = '{ "linkId":"abc",  "status":"PAID" }';
    const res = await POST(post(body, { "svix-id": "e1" }));
    expect(res.status).toBe(200);
    expect(handlePaymentWebhook.mock.calls[0]![0]).toBe(body);
    expect((handlePaymentWebhook.mock.calls[0]![1] as Headers).get("svix-id")).toBe("e1");
  });

  it("answers with the handler's status, e.g. 401 for a bad signature", async () => {
    handlePaymentWebhook.mockResolvedValueOnce({ status: 401, body: { ok: false, outcome: "bad_signature" } });
    expect((await POST(post("{}"))).status).toBe(401);
  });

  it("refuses bodies over 64 KB without processing them", async () => {
    const res = await POST(post("x".repeat(65 * 1024)));
    expect(res.status).toBe(413);
    expect(handlePaymentWebhook).not.toHaveBeenCalled();
  });

  it("answers 500 without details when the handler throws", async () => {
    handlePaymentWebhook.mockRejectedValueOnce(new Error("db down at 0821234567"));
    const res = await POST(post("{}"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("0821234567");
  });
});
