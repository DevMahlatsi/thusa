import { listCollectionRowsBetween, REQUEST_AHEAD_DAYS } from "../collections";
import { mergeWithProjected, projectSchedulesBetween, type ScheduledPayer } from "../dashboard";
import { addDays } from "../schedule-dates";
import { buildInsights, firstName, historyStart, insightPeriod, type Insights } from ".";

/**
 * The insights for the logged-in business. `payers` are its active parents (listPayers). Loads its
 * collections from historyStart up to the furthest a request can go out ahead, and adds the period's
 * due dates that have no request yet.
 */
export async function loadInsights(businessId: string, payers: ScheduledPayer[], today: string): Promise<Insights> {
  const period = insightPeriod(today);
  const rows = mergeWithProjected(
    await listCollectionRowsBetween(businessId, historyStart(today), addDays(today, REQUEST_AHEAD_DAYS)),
    projectSchedulesBetween(payers, period.start, period.end),
  );
  return buildInsights({
    rows,
    payers: payers.flatMap((p) =>
      p.schedule ? [{ id: p.id, firstName: firstName(p.parentName), rhythm: p.schedule.rhythm, feeCents: p.schedule.amountCents }] : [],
    ),
    today,
  });
}
