// Display helpers for schedules. Client-safe: no server-only imports.

import type { Rhythm } from "./dashboard";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * When a schedule collects, e.g. "Every Friday", "Every second Friday", "25th of the month".
 * Payday is an ISO weekday (1 = Monday) for WEEKLY/FORTNIGHTLY and a day of month for MONTHLY.
 */
export function formatPayday(rhythm: Rhythm, payday: number): string {
  if (rhythm === "MONTHLY") {
    if (payday >= 31) return "Last day of the month";
    // Short months collect on their last day instead (see src/lib/payers.ts).
    if (payday >= 29) return `${ordinal(payday)}, or the month's last day`;
    return `${ordinal(payday)} of the month`;
  }
  const day = WEEKDAYS[payday - 1] ?? "Unknown day";
  return rhythm === "WEEKLY" ? `Every ${day}` : `Every second ${day}`;
}
