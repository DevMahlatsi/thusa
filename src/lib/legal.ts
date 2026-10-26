import { z } from "zod";
import { env } from "./env";

// Shared by /terms and /privacy. Change LEGAL_UPDATED whenever either page's wording changes.

export const LEGAL_UPDATED = "26 October 2026";

export const PROTOTYPE_NOTICE = "Hackathon prototype. Not legal advice. To be reviewed before launch.";

/** Where parents and owners send questions and requests (CONTACT_EMAIL). Null until a valid address is set. */
export function contactEmail(value = env().CONTACT_EMAIL): string | null {
  const parsed = z.email().safeParse(value?.trim());
  return parsed.success ? parsed.data : null;
}
