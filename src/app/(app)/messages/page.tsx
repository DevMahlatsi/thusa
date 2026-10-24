import { InfoIcon, RemindersIcon } from "@/components/icons";
import { requirePageBusinessUser } from "@/lib/auth";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { isDemoBusiness, listMessages, MESSAGE_NOTES, type MessageNote } from "@/lib/parent-messages";
import { messagingProviderName } from "@/messaging/adapter";

export const dynamic = "force-dynamic";

// Every message Thusa wrote to a parent for this business, as the parent gets it, and whether it was
// delivered. Phones are only ever stored masked.

const KIND_LABEL = {
  PAYMENT_REQUEST: "Payment request",
  REMINDER: "Reminder",
  BALANCE_REQUEST: "Balance request",
} as const;

// Text label plus colour, never colour alone. Red only for a message that failed.
const STATUS = {
  QUEUED: { label: "Sending", className: "pending" },
  SENT: { label: "Sent", className: "paid" },
  NOT_DELIVERED: { label: "Not sent", className: "not-delivered" },
  FAILED: { label: "Failed", className: "failed" },
} as const;

const formatWhen = (d: Date) =>
  d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

export default async function MessagesPage() {
  const { businessId } = await requirePageBusinessUser();
  const [messages, demo] = await Promise.all([listMessages(businessId), isDemoBusiness(businessId)]);
  const notice = demo
    ? "This is the shared demo account, so messages are shown here and never sent. The parents' numbers are made up."
    : messagingProviderName() === null
      ? "SMS isn't switched on yet. Messages are written and shown here, but not sent to parents."
      : null;

  return (
    <div className="stack">
      {notice && (
        <div className="sample-banner" role="note">
          <InfoIcon size={18} />
          <p>{notice}</p>
        </div>
      )}
      {messages.length === 0 ? (
        <section className="panel empty-state" aria-labelledby="empty-title">
          <span className="empty-icon">
            <RemindersIcon size={24} />
          </span>
          <h2 id="empty-title">No messages yet</h2>
          <p className="muted">
            When you send a payment request, a reminder or a balance request, the SMS to the parent appears here,
            word for word.
          </p>
        </section>
      ) : (
        <section className="panel" aria-labelledby="messages-title">
          <div className="panel-header">
            <div>
              <h2 id="messages-title">Messages to parents</h2>
              <p className="subtitle">Payment links, reminders and balance requests, newest first</p>
            </div>
          </div>
          <ul className="message-list">
            {messages.map((m) => {
              const status = STATUS[m.status];
              const note = m.note && m.note in MESSAGE_NOTES ? MESSAGE_NOTES[m.note as MessageNote] : null;
              return (
                <li className="message-item" key={m.id}>
                  <div className="message-head">
                    <h3>{m.collection.payer.parentName}</h3>
                    <span className={`pill ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="muted small num">
                    {KIND_LABEL[m.kind]} · {m.collection.reference} · {formatWhen(m.createdAt)} · SMS to {m.phoneMasked} ·{" "}
                    {LANGUAGE_NAMES[m.language]} · {m.sentByUserId ? "From the dashboard" : "Automatic"}
                  </p>
                  <p className="message-body">{m.body}</p>
                  {note && <p className="muted small">{note}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
