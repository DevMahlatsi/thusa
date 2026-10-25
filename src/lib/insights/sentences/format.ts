// Amounts as they read in a sentence (docs/AI.md: "R4 200"). Not a ledger line, so no sign. A
// non-breaking space groups thousands, so an amount never splits across lines.

const NBSP = " ";

/** 420000 -> "R4 200", 420050 -> "R4 200.50". */
export function proseRand(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("amountCents must be a non-negative integer");
  const rands = Math.floor(amountCents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const cents = amountCents % 100;
  return cents ? `R${rands}.${String(cents).padStart(2, "0")}` : `R${rands}`;
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 others", given the language's words. */
export function joinNames(names: string[], more: number, and: string, others: (n: number) => string): string {
  const items = more > 0 ? [...names, others(more)] : names;
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}` : (items[0] ?? "");
}
