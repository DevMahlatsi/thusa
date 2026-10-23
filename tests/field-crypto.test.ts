import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, parseFieldKey } from "@/lib/field-crypto";

const key = randomBytes(32);
const phone = "+27821234567";
const ctx = "payer.phone:business-a";

describe("field encryption", () => {
  it("round-trips and never contains the plain number", () => {
    const stored = encryptField(phone, ctx, key);
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("821234567");
    expect(decryptField(stored, ctx, key)).toBe(phone);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptField(phone, ctx, key)).not.toBe(encryptField(phone, ctx, key));
  });

  it("refuses a value copied to another business", () => {
    const stored = encryptField(phone, ctx, key);
    expect(() => decryptField(stored, "payer.phone:business-b", key)).toThrow();
  });

  it("refuses the wrong key", () => {
    expect(() => decryptField(encryptField(phone, ctx, key), ctx, randomBytes(32))).toThrow();
  });

  it("refuses tampered or truncated values", () => {
    const [v, iv, tag, ct] = encryptField(phone, ctx, key).split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0]! ^= 1;
    expect(() => decryptField([v, iv, tag, flipped.toString("base64url")].join("."), ctx, key)).toThrow();
    expect(() => decryptField([v, iv, tag!.slice(0, 6), ct].join("."), ctx, key)).toThrow();
    expect(() => decryptField([v, iv, tag].join("."), ctx, key)).toThrow();
    expect(() => decryptField("garbage", ctx, key)).toThrow();
  });

  it.each([undefined, "", "change-me-32-byte-base64-key", randomBytes(16).toString("base64")])(
    "rejects a missing or wrong-sized key %#",
    (value) => {
      expect(() => parseFieldKey(value)).toThrow(/FIELD_ENCRYPTION_KEY/);
    },
  );
});
