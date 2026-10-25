// Display helpers for money. Amounts are integer cents everywhere; this never does float maths.

const MINUS = "−";
const NBSP = " "; // keeps "R 1 250.00" on one line

function groupThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function assertCents(amountCents: number) {
  if (!Number.isSafeInteger(amountCents)) throw new Error("amountCents must be an integer");
}

function rand(amountCents: number): string {
  assertCents(amountCents);
  const abs = Math.abs(amountCents);
  const cents = (abs % 100).toString().padStart(2, "0");
  return `R${NBSP}${groupThousands(Math.floor(abs / 100))}.${cents}`;
}

/**
 * A total, fee or balance: R 1 250.00, or −R 80.00 below zero. No plus sign: "+R 6 080.00 Outstanding"
 * would read as money gained. For one payment coming in, use formatPayment.
 */
export function formatRand(amountCents: number): string {
  return `${amountCents < 0 ? MINUS : ""}${rand(amountCents)}`;
}

/** One incoming payment: +R 1 250.00 (−R 80.00 for money going back). Only for individual payments, never totals. */
export function formatPayment(amountCents: number): string {
  return `${amountCents < 0 ? MINUS : "+"}${rand(amountCents)}`;
}

/** Short axis label in whole rands: R 0, R 500, R 2k, R 12.5k. Not for amounts shown as values. */
export function formatRandAxis(amountCents: number): string {
  assertCents(amountCents);
  const rands = Math.round(amountCents / 100);
  if (Math.abs(rands) < 1000) return `R${NBSP}${rands}`;
  const thousands = Math.round(rands / 100) / 10;
  return `R${NBSP}${thousands}k`;
}

/**
 * Parses what an owner types as a fee ("350", "R 1 250.50", "1,250.5") into integer cents, or null.
 * Works on the digits as text, so there's no float rounding. A comma before the last one or two digits
 * is a decimal comma ("350,50"); any other commas and spaces are thousands separators.
 */
export function parseRandToCents(input: string): number | null {
  let s = input.trim().replace(/^R/i, "").replace(/\s/g, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Integer cents as a plain form value: 125000 -> "1250.00". No sign, no grouping. */
export function centsToRandInput(amountCents: number): string {
  assertCents(amountCents);
  return `${Math.floor(amountCents / 100)}.${(amountCents % 100).toString().padStart(2, "0")}`;
}
