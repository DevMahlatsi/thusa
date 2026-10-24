"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../api-client";

type Props = {
  url: string;
  // Only names what to act on. The server works out every amount and message itself.
  body: Record<string, string>;
  label: string;
  busyLabel: string;
  ariaLabel: string;
  secondary?: boolean;
};

/** A row action that POSTs, then refreshes the page. Errors from the API are shown under the button. */
export function ActionButton({ url, body, label, busyLabel, ariaLabel, secondary }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await sendJson(url, "POST", body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="send-request">
      <button type="button" className={secondary ? "secondary small" : "small"} onClick={run} disabled={busy} aria-label={ariaLabel}>
        {busy ? busyLabel : label}
      </button>
      {error && (
        <span className="message problem" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
