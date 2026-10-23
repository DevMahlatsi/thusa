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
