import type { Kpis } from "@/lib/dashboard";
import { formatRand } from "@/lib/money";

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

// onTimeNote replaces the on-time sub-label, e.g. before any payment request has been sent.
export function KpiTiles({ kpis, onTimeNote }: { kpis: Kpis; onTimeNote?: string }) {
  const receivedShare = kpis.expectedCents ? kpis.receivedCents / kpis.expectedCents : 0;
  const tiles = [
    { label: "Expected", value: formatRand(kpis.expectedCents), sub: "This month, from all schedules" },
    { label: "Received", value: formatRand(kpis.receivedCents), sub: `${percent(receivedShare)} of expected` },
    { label: "Outstanding", value: formatRand(kpis.outstandingCents), sub: "Still to come this month" },
    {
      label: "On-time rate",
      value: kpis.onTimeRate === null ? "–" : percent(kpis.onTimeRate),
      sub: onTimeNote ?? `Of ${kpis.dueSoFar} payments due so far`,
    },
  ];
  return (
    <section className="kpis" aria-label="This month at a glance">
      {tiles.map((t) => (
        <div className="panel kpi" key={t.label}>
          <p className="label">{t.label}</p>
          <p className="figure">{t.value}</p>
          <p className="sub">{t.sub}</p>
        </div>
      ))}
    </section>
  );
}
