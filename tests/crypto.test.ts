import { describe, expect, it } from "vitest";
import { generateOtp, generateSessionToken, hashOtp, hashSessionToken, otpMatches } from "@/lib/auth/crypto";

const secret = "test-secret-that-is-long-enough-for-hmac";

describe("OTP crypto", () => {
  it("generates 6-digit codes, including leading zeros", () => {
    for (let i = 0; i < 500; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("does not store the code itself", () => {
    expect(hashOtp("challenge-1", "123456", secret)).not.toContain("123456");
  });

  it("matches only the right code for the right challenge", () => {
    const hash = hashOtp("challenge-1", "123456", secret);
    expect(otpMatches(hash, "challenge-1", "123456", secret)).toBe(true);
    expect(otpMatches(hash, "challenge-1", "123457", secret)).toBe(false);
    expect(otpMatches(hash, "challenge-2", "123456", secret)).toBe(false);
    expect(otpMatches(hash, "challenge-1", "123456", `${secret}-other`)).toBe(false);
  });

  it("rejects malformed stored hashes without throwing", () => {
    expect(otpMatches("not-hex", "challenge-1", "123456", secret)).toBe(false);
  });
});

describe("session tokens", () => {
  it("are long, random and stored only as a hash", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
  });
});
