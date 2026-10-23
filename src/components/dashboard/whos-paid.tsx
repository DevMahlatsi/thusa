import { RHYTHM_LABEL, type ParentSummary } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatRand } from "@/lib/money";
import { SamplePill, StatusPill } from "../status-pill";

// Problems sort first, so the top rows are the ones that need attention.
const VISIBLE_ROWS = 5;

export function WhosPaid({ parents, isSample }: { parents: ParentSummary[]; isSample: boolean }) {
  const upToDate = parents.filter((p) => p.status === "PAID").length;
  const share = parents.length ? (upToDate / parents.length) * 100 : 0;
  const hidden = parents.length - VISIBLE_ROWS;
  return (
    <section className="panel" aria-labelledby="whos-paid-title">
      <div className="panel-header">
        <div>
          <h2 id="whos-paid-title">Who&apos;s paid</h2>
          <p className="subtitle">Everything due so far</p>
        </div>
        {isSample && <SamplePill />}
      </div>
      <p className="figure">
        {upToDate} <span className="figure-of">of {parents.length} parents up to date</span>
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={parents.length}
        aria-valuenow={upToDate}
        aria-label="Parents up to date"
      >
        <span style={{ width: `${share}%` }} />
      </div>
      <ul className="people">
        {parents.slice(0, VISIBLE_ROWS).map((p) => (
          <li key={p.parentName}>
            <span className="avatar" aria-hidden="true">
              {initials(p.parentName)}
            </span>
            <div className="who">
              <strong>{p.parentName}</strong>
              <span>
                {p.childName} · {RHYTHM_LABEL[p.rhythm]}
              </span>
            </div>
            <div className="what">
              <span className="num">{formatRand(p.receivedCents)}</span>
              <StatusPill status={p.status} />
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="muted small more-row">
          + {hidden} more {hidden === 1 ? "parent" : "parents"}
          {parents.slice(VISIBLE_ROWS).every((p) => p.status === "PAID") ? ", all paid up" : ""}
        </p>
      )}
    </section>
  );
}
