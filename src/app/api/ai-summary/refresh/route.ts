import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshSummary } from "@/ai/stored-summary";
import { requireBusinessUser } from "@/lib/auth";
import { apiRoute, HttpError, parseJson } from "@/lib/http";
import { loadInsights } from "@/lib/insights/load";
import { listScheduledPayers, todayInSa } from "@/lib/payers";
import { LANGUAGES } from "@/messaging/templates/types";

// The owner's Refresh on "This week in plain words": writes the week's AI summary again now, for the session's
// business only. Takes just the language; the numbers are worked out here from the stored records. Limits
// (5 refreshes and 20 AI calls per business per SA day) are in src/ai/stored-summary.ts.

const bodySchema = z.strictObject({ language: z.enum(LANGUAGES, { error: "Choose a language." }) });

export const POST = apiRoute(async (req) => {
  const { user, businessId } = await requireBusinessUser(["OWNER"]);
  const { language } = await parseJson(req, bodySchema);
  const payers = await listScheduledPayers(businessId);
  // Sample data never goes to OpenAI.
  if (!payers.some((p) => p.schedule)) throw new HttpError(409, "Add your parents first: there's nothing to summarise yet.");
  const insights = await loadInsights(businessId, payers, todayInSa());
  await refreshSummary({ userId: user.id, businessId }, insights, language);
  return NextResponse.json({ ok: true }, { status: 201 });
});
