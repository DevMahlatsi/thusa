"use client";

import Link from "next/link";
import { useState } from "react";
import { sendJson } from "./api-client";
import { ConsentLinks } from "./legal-links";

type Sent = { message: { status: string; phoneMasked: string } };

/** The demo's "Send to my WhatsApp": the judge's number and their agreement, nothing else. */
export function WhatsAppSampleForm({ collectionId }: { collectionId: string }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent["message"] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Tick the box to agree to get this WhatsApp message.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendJson<Sent>(`/api/collections/${collectionId}/whatsapp-sample`, "POST", { phone, consent });
      setSent(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="stack">
        {sent.status === "SENT" ? (
          <p className="message" role="status">
            Sent to {sent.phoneMasked}. It comes from Thusa&apos;s WhatsApp number. Tap <strong>Pay now</strong> to pay
            on Stitch&apos;s test page (no real money), then come back to the dashboard: the fee turns Paid once Stitch
            confirms the payment.
          </p>
        ) : (
          <p className="message problem" role="alert">
            WhatsApp didn&apos;t take the message. It&apos;s on the Messages page with the reason.
          </p>
        )}
        <div className="form-actions">
          <Link href="/dashboard" className="button">
            Go to the dashboard
          </Link>
          <Link href="/messages" className="button secondary">
            See it on Messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <fieldset disabled={busy} className="stack">
        <div>
          <label htmlFor="sample-phone">
            Your WhatsApp number <span className="hint">A South African cellphone number, e.g. 082 123 4567</span>
          </label>
          <input
            id="sample-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="082 123 4567"
            autoComplete="tel"
            required
            maxLength={20}
          />
        </div>
        <div>
          <label className="check" htmlFor="sample-consent">
            <input id="sample-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree to get this one WhatsApp message from Thusa. Thusa won&apos;t keep my number (only its last four
              digits, and a one-way code that limits repeats) or message me again.
            </span>
          </label>
          <ConsentLinks />
        </div>
      </fieldset>
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send to my WhatsApp"}
        </button>
        <Link href="/dashboard" className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
