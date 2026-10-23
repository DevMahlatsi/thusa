// Display helpers for money. Amounts are integer cents everywhere; this never does float maths.

const MINUS = "−";
const NBSP = " "; // keeps "R 1 250.00" on one line

function groupThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function assertCents(amountCents: number) {
  if (!Number.isSafeInteger(amountCents)) throw new Error("amountCents must be an integer");
}

/** Formats integer cents as a signed rand amount, e.g. +R 1 250.00 or −R 80.00. Signs are always shown. */
export function formatRand(amountCents: number): string {
  assertCents(amountCents);
  const sign = amountCents < 0 ? MINUS : "+";
  const abs = Math.abs(amountCents);
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${sign}R${NBSP}${groupThousands(Math.floor(abs / 100))}.${cents}`;
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
