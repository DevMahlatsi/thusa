import { describe, expect, it } from "vitest";
import { paymentLink } from "@/payments/adapter";

// Only a provider's own payment page can go into a message to a parent.
describe("paymentLink", () => {
  it("accepts Stitch payment pages over https", () => {
    expect(paymentLink("https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa")).toBe(
      "https://express.stitch.money/pay/uoJKLysCwhRAHNWAQR4SFa",
    );
    expect(paymentLink("https://stitch.money/x")).toBe("https://stitch.money/x");
  });

  it.each([
    ["no link", null],
    ["plain http", "http://express.stitch.money/pay/x"],
    ["another site", "https://evil.example/pay"],
    ["a lookalike host", "https://stitch.money.evil.example/pay"],
    ["a host that only ends in the name", "https://notstitch.money/pay"],
    ["credentials in the URL", "https://user:pass@express.stitch.money/pay"],
    ["not a URL", "express.stitch.money/pay"],
    ["a script", "javascript:alert(1)"],
  ])("refuses %s", (_label, url) => {
    expect(paymentLink(url)).toBeNull();
  });
});
