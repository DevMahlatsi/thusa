import { ExpectedVsReceivedChart } from "@/components/dashboard/expected-vs-received-chart";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { RecentCollections } from "@/components/dashboard/recent-collections";
import { WhosPaid } from "@/components/dashboard/whos-paid";
import { InfoIcon } from "@/components/icons";
import { SamplePill } from "@/components/status-pill";
import { requirePageBusinessUser } from "@/lib/auth";
import { computeKpis, summariseParents, weeklyBuckets } from "@/lib/dashboard";
import { SAMPLE_MONTH, SAMPLE_TODAY, SAMPLE_YEAR, sampleCollections } from "@/lib/sample-dashboard";

export default async function DashboardPage() {
  await requirePageBusinessUser();

  // No parents or collections exist yet (demo priorities 2–4), so every business sees the sample preview.
  const isSample = true;
  const rows = sampleCollections();
  const today = SAMPLE_TODAY;
  const kpis = computeKpis(rows, today);
  const weeks = weeklyBuckets(rows, SAMPLE_YEAR, SAMPLE_MONTH, today);
  const parents = summariseParents(rows, today);
  const recent = [...rows]
    .filter((r) => r.dueDate <= today)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.parentName.localeCompare(b.parentName))
    .slice(0, 8);
  const monthLabel = new Date(Date.UTC(SAMPLE_YEAR, SAMPLE_MONTH - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="dashboard">
      {isSample && (
        <div className="sample-banner" role="note">
          <InfoIcon size={18} />
          <p>
            <strong>Sample data.</strong> Parent A, Parent B and the amounts below are made up to show how this page
            will look. Your real figures appear here once you add parents.
          </p>
        </div>
      )}

      <div className="page-intro">
        <p className="muted">{monthLabel}</p>
        {isSample && <SamplePill />}
      </div>

      <KpiTiles kpis={kpis} />

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

      <RecentCollections rows={recent} isSample={isSample} />
    </div>
  );
}
