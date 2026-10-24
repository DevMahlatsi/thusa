// Svix webhook signatures, as Stitch Express sends them.
import { describe, expect, it } from "vitest";
import { svixHeaders, verifySvix, WebhookSignatureError } from "@/payments/svix";

// A fake, test-only key: whsec_ + base64 of 24 bytes.
const SECRET = `whsec_${Buffer.from("test-webhook-secret-24by").toString("base64")}`; // gitleaks:allow
const OTHER = `whsec_${Buffer.from("another-test-secret-24by").toString("base64")}`; // gitleaks:allow
const body = JSON.stringify({ amount: 30000, linkId: "uoJKLysCwhRAHNWAQR4SFa", status: "PAID", type: "LINK" });
const now = new Date("2026-10-24T10:00:00Z");

const fails = (fn: () => unknown) => expect(fn).toThrow(WebhookSignatureError);

describe("verifySvix", () => {
  it("accepts a correctly signed delivery and returns its id", () => {
    const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
    expect(verifySvix(SECRET, body, headers, now)).toBe("payment-paid-1");
  });

  it("refuses a body changed after signing", () => {
    const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
    fails(() => verifySvix(SECRET, body.replace("30000", "99999"), headers, now));
  });

  it("refuses a different id than the one signed", () => {
    const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
    headers.set("svix-id", "payment-paid-2");
    fails(() => verifySvix(SECRET, body, headers, now));
  });

  it("refuses another secret's signature", () => {
    fails(() => verifySvix(SECRET, body, svixHeaders(OTHER, "payment-paid-1", body, now), now));
  });

  it("refuses deliveries more than five minutes old or ahead", () => {
    const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
    fails(() => verifySvix(SECRET, body, headers, new Date(now.getTime() + 6 * 60_000)));
    fails(() => verifySvix(SECRET, body, headers, new Date(now.getTime() - 6 * 60_000)));
    expect(verifySvix(SECRET, body, headers, new Date(now.getTime() + 4 * 60_000))).toBe("payment-paid-1");
  });

  it("refuses missing headers", () => {
    for (const name of ["svix-id", "svix-timestamp", "svix-signature"]) {
      const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
      headers.delete(name);
      fails(() => verifySvix(SECRET, body, headers, now));
    }
  });

  it("accepts any one matching signature in the list, as during a secret rotation", () => {
    const headers = svixHeaders(SECRET, "payment-paid-1", body, now);
    const good = headers.get("svix-signature")!;
    const stale = svixHeaders(OTHER, "payment-paid-1", body, now).get("svix-signature")!;
    headers.set("svix-signature", `${stale} v2,ignored ${good}`);
    expect(verifySvix(SECRET, body, headers, now)).toBe("payment-paid-1");
  });
});
