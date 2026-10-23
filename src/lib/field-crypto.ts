import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

// Field-level encryption for personal data at rest (payer phone numbers now, bank details later).
// AES-256-GCM with a random IV per value. The context (e.g. "payer.phone:<businessId>") is bound in
// as associated data, so a ciphertext copied into another business's row fails to decrypt.
// Stored format: v1.<iv>.<tag>.<ciphertext>, each part base64url.

const VERSION = "v1";
const IV_BYTES = 12;

export function parseFieldKey(value: string | undefined): Buffer {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (see .env.example)");
  }
  return key;
}

const defaultKey = () => parseFieldKey(env().FIELD_ENCRYPTION_KEY);

export function encryptField(plaintext: string, context: string, key = defaultKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Throws if the value was tampered with, encrypted under another context, or with another key. */
export function decryptField(stored: string, context: string, key = defaultKey()): string {
  const [version, iv, tag, ciphertext, ...rest] = stored.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error("Unreadable encrypted field");
  }
  // Fixed tag length: GCM would otherwise accept a truncated (easier to forge) tag.
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
