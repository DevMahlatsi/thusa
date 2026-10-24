import { RHYTHM_LABEL, type CollectionRow } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatRand } from "@/lib/money";
import { MAX_REMINDERS } from "@/lib/reminders";
import { SamplePill, StatusPill } from "../status-pill";
import { RemindButton, RequestBalanceButton, SendRequestButton } from "./send-request-button";

const formatDue = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

type Props = { rows: CollectionRow[]; isSample: boolean; canSend: boolean; today: string };

const muted = (text: string) => <span className="muted small">{text}</span>;

/** What the owner can do next with a row: send it, ask for the balance, remind, or nothing. */
function RowAction({ row: r, isSample, canSend, today }: { row: CollectionRow } & Omit<Props, "rows">) {
  if (!r.requested) {
    return canSend ? <SendRequestButton payerId={r.payerId} dueDate={r.dueDate} parentName={r.parentName} /> : muted("Not sent");
  }
  if (r.status === "PAID") {
    return (
      <span className="muted" aria-label="No action needed">
        –
      </span>
    );
  }
  if (isSample) {
    return (
      <button type="button" className="secondary small" aria-disabled="true" title="Sample data">
        Remind
      </button>
    );
  }
  const page = r.paymentUrl && (
    <a
      className="button secondary small"
      href={r.paymentUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${r.parentName}'s payment page`}
    >
      Payment page
    </a>
  );
  let next: React.ReactNode = null;
  if (!canSend) next = null;
  else if (r.status === "PARTIAL" && !r.balanceRequested) next = <RequestBalanceButton collectionId={r.id} parentName={r.parentName} />;
  else if (r.dueDate > today) next = null;
  else if (r.remindedToday) next = muted("Reminded today");
  else if (r.remindersSent >= MAX_REMINDERS) next = muted(`${MAX_REMINDERS} reminders sent`);
  else next = <RemindButton collectionId={r.id} parentName={r.parentName} />;
  return (
    <span className="row-actions">
      {next}
      {page}
    </span>
  );
}

export function RecentCollections({ rows, isSample, canSend, today }: Props) {
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
                    <RowAction row={r} isSample={isSample} canSend={canSend} today={today} />
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
