"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { sendJson } from "./api-client";

type Language = keyof typeof LANGUAGE_NAMES;

type ShareProps = {
  link: string;
  // The fixed parent_invite template, rendered on the server in each language.
  messages: Record<Language, string>;
  defaultLanguage: Language;
};

/** The invite link and its message, for the owner to send from their own phone. Thusa sends nothing itself. */
export function InviteShare({ link, messages, defaultLanguage }: ShareProps) {
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [copied, setCopied] = useState<"message" | "link" | "failed" | null>(null);
  const message = messages[language];

  async function copy(what: "message" | "link") {
    try {
      await navigator.clipboard.writeText(what === "message" ? message : link);
      setCopied(what);
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="stack">
      <div className="invite-share-head">
        <label htmlFor="invite-language">Message language</label>
        <select
          id="invite-language"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value as Language);
            setCopied(null);
          }}
        >
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <p className="message-body" aria-label="Message to send">
        {message}
      </p>
      <div className="form-actions">
        <button type="button" onClick={() => copy("message")}>
          Copy message
        </button>
        <a className="button secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          Send on WhatsApp
        </a>
        <button type="button" className="secondary" onClick={() => copy("link")}>
          Copy link only
        </button>
      </div>
      <p className="muted small" role="status" aria-live="polite">
        {copied === "message" && "Message copied. Paste it into WhatsApp or an SMS to the parent."}
        {copied === "link" && "Link copied."}
        {copied === "failed" && "Couldn't copy here. Select the message above and copy it."}
      </p>
    </div>
  );
}

type ConfirmProps = {
  url: string;
  label: string;
  question: string;
  confirmLabel: string;
  busyLabel: string;
  keepLabel: string;
};

/** A two-step action (decline, cancel): asks first, then POSTs an empty body and refreshes the page. */
export function ConfirmAction({ url, label, question, confirmLabel, busyLabel, keepLabel }: ConfirmProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await sendJson(url, "POST", {});
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="stack-tight">
        <div>
          <button type="button" className="secondary" onClick={() => setConfirming(true)}>
            {label}
          </button>
        </div>
        {error && (
          <p className="message problem" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="stack-tight" role="group" aria-label={label}>
      <p>{question}</p>
      <div className="form-actions">
        <button type="button" onClick={run} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          {keepLabel}
        </button>
      </div>
    </div>
  );
}
