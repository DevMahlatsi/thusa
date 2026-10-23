import { RHYTHM_LABEL, type CollectionRow } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatRand } from "@/lib/money";
import { SamplePill, StatusPill } from "../status-pill";

const formatDue = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

export function RecentCollections({ rows, isSample }: { rows: CollectionRow[]; isSample: boolean }) {
  return (
    <section className="panel" aria-labelledby="recent-title">
      <div className="panel-header">
        <div>
          <h2 id="recent-title">Recent collections</h2>
          <p className="subtitle">Latest payment requests, newest first</p>
        </div>
        {isSample && <SamplePill />}
      </div>
      <div className="table-wrap">
        <table className="table responsive">
          <thead>
            <tr>
              <th scope="col">Parent</th>
              <th scope="col">Reference</th>
              <th scope="col">Due</th>
              <th scope="col" className="right">
                Amount
              </th>
              <th scope="col">Rhythm</th>
              <th scope="col">Status</th>
              <th scope="col" className="right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-col="parent">
                  <span className="parent">
                    <span className="avatar" aria-hidden="true">
                      {initials(r.parentName)}
                    </span>
                    {r.parentName}
                  </span>
                </td>
                <td data-col="meta">
                  Due {formatDue(r.dueDate)} · {RHYTHM_LABEL[r.rhythm]} · {r.reference}
                </td>
                <td data-col="ref" className="ref">
                  {r.reference}
                </td>
                <td data-col="due" className="num">
                  {formatDue(r.dueDate)}
                </td>
                <td data-col="amount" className="right amount">
                  {formatRand(r.amountCents)}
                  {r.status === "PARTIAL" && <span>{formatRand(r.paidCents)} paid</span>}
                </td>
                <td data-col="rhythm">{RHYTHM_LABEL[r.rhythm]}</td>
                <td data-col="status">
                  <StatusPill status={r.status} />
                </td>
                <td data-col="action" className="right">
                  {r.status === "PAID" ? (
                    <span className="muted" aria-label="No action needed">
                      –
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="secondary small"
                      aria-disabled="true"
                      title={isSample ? "Sample data: reminders arrive in a later build" : "Coming soon"}
                    >
                      Remind
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
