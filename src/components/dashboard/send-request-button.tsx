"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../api-client";

// Sends only which parent and which due date. The server works out the amount from the schedule.
export function SendRequestButton({ payerId, dueDate, parentName }: { payerId: string; dueDate: string; parentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await sendJson("/api/collections", "POST", { payerId, dueDate });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="send-request">
      <button type="button" className="small" onClick={send} disabled={busy} aria-label={`Send payment request to ${parentName}`}>
        {busy ? "Sending…" : "Send request"}
      </button>
      {error && (
        <span className="message problem" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
