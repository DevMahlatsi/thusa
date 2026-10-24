import { RHYTHM_LABEL, type CollectionRow } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatRand } from "@/lib/money";
import { SamplePill, StatusPill } from "../status-pill";
import { SendRequestButton } from "./send-request-button";

const formatDue = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

type Props = { rows: CollectionRow[]; isSample: boolean; canSend: boolean };

export function RecentCollections({ rows, isSample, canSend }: Props) {
  return (
    <section className="panel" aria-labelledby="recent-title">
      <div className="panel-header">
        <div>
          <h2 id="recent-title">Recent collections</h2>
          <p className="subtitle">
            {isSample ? "Latest payment requests, newest first" : "This month's requests and fees due in the next week"}
          </p>
        </div>
        {isSample && <SamplePill />}
      </div>
      {rows.length === 0 ? (
        <p className="muted small">No payment requests yet. They&apos;ll appear here once Thusa starts sending them.</p>
      ) : (
        <div className="table-wrap">
          <table className="table responsive collections-table">
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
                    Due {formatDue(r.dueDate)} · {RHYTHM_LABEL[r.rhythm]} · {r.requested ? r.reference : "Not sent yet"}
                  </td>
                  <td data-col="ref" className="ref">
                    {r.requested ? r.reference : "Not sent yet"}
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
                    {!r.requested ? (
                      canSend ? (
                        <SendRequestButton payerId={r.payerId} dueDate={r.dueDate} parentName={r.parentName} />
                      ) : (
                        <span className="muted small">Not sent</span>
                      )
                    ) : r.status === "PAID" ? (
                      <span className="muted" aria-label="No action needed">
                        –
                      </span>
                    ) : r.paymentUrl ? (
                      <a
                        className="button secondary small"
                        href={r.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${r.parentName}'s payment page`}
                      >
                        Payment page
                      </a>
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
      )}
    </section>
  );
}
