import { notFound } from "next/navigation";
import { devOutbox } from "@/messaging/adapter";

export const dynamic = "force-dynamic";

// Development only: shows stubbed SMS/WhatsApp messages (including login codes) so they never go to logs.
export default function DevOutboxPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const messages = devOutbox();
  return (
    <main className="content stack narrow">
      <div>
        <h1>Dev outbox</h1>
        <p className="muted">Messages the stub provider would have sent. Refresh to see new ones.</p>
      </div>
      {messages.length === 0 && <p className="panel">No messages yet.</p>}
      {messages.map((m) => (
        <section className="panel" key={m.sentAt + m.to}>
          <p className="muted small num">
            {m.channel.toUpperCase()} · {m.to} · {m.template} · {new Date(m.sentAt).toLocaleTimeString("en-ZA")}
          </p>
          <p>{m.body}</p>
        </section>
      ))}
    </main>
  );
}
