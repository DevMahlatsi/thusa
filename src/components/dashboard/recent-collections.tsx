import Link from "next/link";
import { canRequestNow } from "@/lib/collections";
import { RHYTHM_LABEL, type CollectionRow } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatPayment, formatRand } from "@/lib/money";
import { MAX_REMINDERS } from "@/lib/reminders";
import { SamplePill, StatusPill } from "../status-pill";
import { RemindButton, RequestBalanceButton, SendRequestButton } from "./send-request-button";

const formatDue = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

type TableProps = {
  rows: CollectionRow[];
  isSample: boolean;
  canSend: boolean;
  today: string;
  // Demo account only: judges can see a sent, unpaid request as its WhatsApp message ("preview" while
  // WhatsApp is off) or send it to their own WhatsApp ("send").
  whatsApp?: "preview" | "send";
};

const muted = (text: string) => <span className="muted small">{text}</span>;

/** What the owner can do next with a row: send it, ask for the balance, remind, or nothing. */
function RowAction({ row: r, isSample, canSend, today, whatsApp }: { row: CollectionRow } & Omit<TableProps, "rows">) {
  if (!r.requested) {
    // Requests go out for this month's fees, up to a week ahead; anything else can't be sent from here.
    if (!canSend || !canRequestNow(r.dueDate, today)) return muted(r.dueDate > today ? "Not sent yet" : "Not sent");
    return <SendRequestButton payerId={r.payerId} dueDate={r.dueDate} parentName={r.parentName} />;
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
  const sample = whatsApp && canSend && r.status === "PENDING" && r.paymentUrl && (
    <Link
      className="button secondary small"
      href={`/collections/${r.id}/whatsapp`}
      aria-label={
        whatsApp === "send"
          ? `Send ${r.parentName}'s payment request to your own WhatsApp`
          : `See ${r.parentName}'s payment request as a WhatsApp message`
      }
    >
      {whatsApp === "send" ? "WhatsApp me" : "WhatsApp preview"}
    </Link>
  );
  return (
    <span className="row-actions">
      {next}
      {sample}
      {page}
    </span>
  );
}

/** The fees table, shared by the dashboard's Recent collections and the Collections page. */
export function CollectionsTable({ rows, isSample, canSend, today, whatsApp }: TableProps) {
  return (
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
                {r.status === "PARTIAL" && <span>{formatPayment(r.paidCents)} paid</span>}
              </td>
              <td data-col="rhythm">{RHYTHM_LABEL[r.rhythm]}</td>
              <td data-col="status">
                <StatusPill status={r.status} />
              </td>
              <td data-col="action" className="right">
                <RowAction row={r} isSample={isSample} canSend={canSend} today={today} whatsApp={whatsApp} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentCollections({ rows, isSample, canSend, today, whatsApp }: TableProps) {
  return (
    <section className="panel" aria-labelledby="recent-title">
      <div className="panel-header">
        <div>
          <h2 id="recent-title">Recent collections</h2>
          <p className="subtitle">
            {isSample ? "Latest payment requests, newest first" : "This month's requests and fees due in the next week"}
          </p>
        </div>
        {isSample ? (
          <SamplePill />
        ) : (
          <Link href="/collections" className="button secondary small">
            View all
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted small">No payment requests yet. They&apos;ll appear here once Thusa starts sending them.</p>
      ) : (
        <CollectionsTable rows={rows} isSample={isSample} canSend={canSend} today={today} whatsApp={whatsApp} />
      )}
    </section>
  );
}
