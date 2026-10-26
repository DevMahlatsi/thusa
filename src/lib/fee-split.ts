// Splits a monthly fee into what one collection asks for. Client-safe and pure: the invite page shows these
// amounts, but the server works them out again from the stored fee and never takes one from a request.
//
// A year's fees are spread evenly: 12 months' worth over 26 fortnights or 52 weeks, so a parent who pays
// weekly pays the same in a year as one who pays monthly. Integer cents only, rounded half up to the cent.
// The migration CHECKs the same sum (PayerInvite_amount_is_split), so change both together.

import type { Rhythm } from "./dashboard";

const PER_YEAR: Record<Rhythm, number> = { MONTHLY: 12, FORTNIGHTLY: 26, WEEKLY: 52 };

/** n / d rounded half up, for non-negative integers, without float rounding. */
function divideRounded(n: number, d: number): number {
  const q = Math.floor(n / d);
  return 2 * (n - q * d) >= d ? q + 1 : q;
}

/** What one collection asks for: e.g. R 1 200.00 a month is R 553.85 a fortnight or R 276.92 a week. */
export function splitMonthlyFee(monthlyAmountCents: number, rhythm: Rhythm): number {
  if (!Number.isSafeInteger(monthlyAmountCents) || monthlyAmountCents <= 0) {
    throw new Error("monthlyAmountCents must be a positive integer");
  }
  if (rhythm === "MONTHLY") return monthlyAmountCents;
  return divideRounded(monthlyAmountCents * 12, PER_YEAR[rhythm]);
}
