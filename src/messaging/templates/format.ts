import type { FeeParams } from "./types";

// Formatting shared by every language. Plain characters only (no non-breaking spaces or curly quotes),
// so an SMS stays in the GSM alphabet: one stray character would halve how much text fits in a part.

/** 125000 -> "R1 250.00". No sign: this is what the parent owes, not a ledger line. */
export function smsRand(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("amountCents must be a non-negative integer");
  const rands = Math.floor(amountCents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${rands}.${(amountCents % 100).toString().padStart(2, "0")}`;
}

/** "2026-10-23" -> "23/10/2026": the way South African statements and slips write dates. */
export function smsDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// Names can be long (business up to 100, child up to 80). Messages keep them short enough to stay
// within a few SMS parts.
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}.` : text);

/**
 * Names go into messages as plain words: letters, digits, spaces and ' - & ( ) , only. Dots, slashes,
 * colons and @ are dropped, so a business name like "Pay at www.evil.example" can never become a link
 * or an address in a parent's SMS. The only link in a message is the PaymentLink.
 */
export function plainName(name: string): string {
  return name
    .replace(/[^\p{L}\p{M}\p{N}' &(),-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const businessName = (p: Pick<FeeParams, "business">) => clip(plainName(p.business), 40);
export const childName = (p: Pick<FeeParams, "child">) => clip(plainName(p.child), 30);
