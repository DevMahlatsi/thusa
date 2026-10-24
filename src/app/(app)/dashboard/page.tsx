import Link from "next/link";
import { ExpectedVsReceivedChart } from "@/components/dashboard/expected-vs-received-chart";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { RecentCollections } from "@/components/dashboard/recent-collections";
import { WhosPaid } from "@/components/dashboard/whos-paid";
import { InfoIcon } from "@/components/icons";
import { SamplePill } from "@/components/status-pill";
import { requirePageBusinessUser } from "@/lib/auth";
import { listCollectionRows, REQUEST_AHEAD_DAYS } from "@/lib/collections";
import { computeKpis, mergeWithProjected, projectSchedules, summariseParents, weeklyBuckets } from "@/lib/dashboard";
import { listPayers, todayInSa } from "@/lib/payers";
import { addDays } from "@/lib/schedule-dates";
import { SAMPLE_MONTH, SAMPLE_TODAY, SAMPLE_YEAR, sampleCollections } from "@/lib/sample-dashboard";

export default async function DashboardPage() {
  const { businessId, role } = await requirePageBusinessUser();

  // Names and schedules only: the dashboard never decrypts phone numbers.
  const payers = (await listPayers(businessId)).map((p) => ({
    id: p.id,
    parentName: p.parentName,
    childName: p.childName,
    schedule: p.schedule && {
      amountCents: p.schedule.amountCents,
      rhythm: p.schedule.rhythm,
      payday: p.schedule.payday,
      startsOn: p.schedule.startsOn.toISOString().slice(0, 10),
    },
  }));

  // The sample preview shows until the business has a parent with a schedule. After that, rows are this
  // month's payment requests, plus each schedule's due dates that don't have a request yet.
  const isSample = !payers.some((p) => p.schedule);
  const today = isSample ? SAMPLE_TODAY : todayInSa();
  const year = isSample ? SAMPLE_YEAR : Number(today.slice(0, 4));
  const month = isSample ? SAMPLE_MONTH : Number(today.slice(5, 7));
  const rows = isSample
    ? sampleCollections()
    : mergeWithProjected(await listCollectionRows(businessId, year, month), projectSchedules(payers, year, month));
  const hasCollections = rows.some((r) => r.requested);
  // Unrequested rows are never "paid on time", so an on-time rate would read 0%: show none instead.
  const kpis = { ...computeKpis(rows, today), ...(!hasCollections && { onTimeRate: null }) };
  const weeks = weeklyBuckets(rows, year, month, today);
  const parents = summariseParents(rows, today);
  // Real rows include fees due in the next week, so the owner can send those requests early.
  const recentUntil = isSample ? today : addDays(today, REQUEST_AHEAD_DAYS);
  const recent = rows
    .filter((r) => r.dueDate <= recentUntil)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.parentName.localeCompare(b.parentName))
    .slice(0, 10);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="dashboard">
      {isSample ? (
        <div className="sample-banner" role="note">
          <InfoIcon size={18} />
          <p>
            <strong>Sample data.</strong> Parent A, Parent B and the amounts below are made up to show how this page
            will look. Your real figures appear here once you <Link href="/parents">add parents</Link>.
          </p>
        </div>
      ) : (
        !hasCollections && (
          <div className="sample-banner" role="note">
            <InfoIcon size={18} />
            <p>
              <strong>No payment requests sent yet.</strong> Expected amounts come from your parents&apos; schedules.
              Use <em>Send request</em> under Recent collections for fees due in the next {REQUEST_AHEAD_DAYS} days.
              Received and on-time figures fill in as parents pay.
            </p>
          </div>
        )
      )}

      <div className="page-intro">
        <p className="muted">{monthLabel}</p>
        {isSample && <SamplePill />}
      </div>

      <KpiTiles kpis={kpis} onTimeNote={hasCollections ? undefined : "No payments requested yet"} />

      <div className="split">
        <section className="panel" aria-labelledby="chart-title">
          <div className="panel-header">
            <div>
              <h2 id="chart-title">Expected vs received</h2>
              <p className="subtitle">Per week in {monthLabel}, by due date</p>
            </div>
            {isSample && <SamplePill />}
          </div>
          <ExpectedVsReceivedChart weeks={weeks} />
        </section>
        <WhosPaid parents={parents} isSample={isSample} />
      </div>

      <RecentCollections rows={recent} isSample={isSample} canSend={!isSample && role !== "READONLY"} today={today} />
    </div>
  );
}
