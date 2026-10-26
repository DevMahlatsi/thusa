"use client";

import { useState } from "react";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { RHYTHM_LABEL, type Rhythm } from "@/lib/dashboard";
import { formatRand } from "@/lib/money";
import { formatPayday } from "@/lib/schedule-format";
import { sendJson } from "./api-client";
import { ConsentLinks } from "./legal-links";

type Language = keyof typeof LANGUAGE_NAMES;

type Props = {
  token: string;
  businessName: string;
  // The number the owner gave (••••4567). The parent can't change it.
  phoneMasked: string | null;
  // Worked out on the server from the owner's monthly fee. Shown only: the form never sends an amount.
  options: { rhythm: Rhythm; amountCents: number }[];
  defaultLanguage: Language;
  consentText: string;
};

const EVERY: Record<Rhythm, string> = { MONTHLY: "each month", FORTNIGHTLY: "every two weeks", WEEKLY: "each week" };

// Most parents are paid on a Friday or on the 25th.
const DEFAULT_PAYDAY = { weekday: 5, monthDay: 25 };

const paydayOptions = (rhythm: Rhythm) =>
  rhythm === "MONTHLY" ? Array.from({ length: 31 }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 6, 7];

/** What the parent is agreeing to, in plain words, before they fill anything in. */
export function JoinNotice({ businessName }: { businessName: string }) {
  return (
    <section className="join-notice" aria-labelledby="join-notice-title">
      <h2 id="join-notice-title">What happens</h2>
      <ol>
        <li>You choose how often you pay and your payday. {businessName} sets the amount.</li>
        <li>{businessName} checks your details and approves them. Nothing is sent to you before that.</li>
        <li>
          On each payday Thusa sends you a payment request by SMS or WhatsApp, with a link to pay from any bank. If a
          payment is missed, you get a polite reminder.
        </li>
      </ol>
      <p>
        Thusa keeps your name, cellphone number, payday, language, your payments and that you agreed, for {businessName}.
        Thusa never asks for your PIN or banking password. Parents never pay Thusa fees, and there are no late fees.
      </p>
      <p>You can stop at any time: ask {businessName} to remove you, and the messages stop.</p>
    </section>
  );
}

/** The parent's side of an invite. On success it says what happens next; the owner still has to approve. */
export function JoinForm({ token, businessName, phoneMasked, options, defaultLanguage, consentText }: Props) {
  const first = options[0]!.rhythm;
  const [values, setValues] = useState({
    parentName: "",
    rhythm: first,
    payday: first === "MONTHLY" ? DEFAULT_PAYDAY.monthDay : DEFAULT_PAYDAY.weekday,
    language: defaultLanguage,
    consent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function setRhythm(rhythm: Rhythm) {
    setValues((v) => {
      // Weekly <-> fortnightly keeps the weekday; to or from monthly the payday means something else.
      const sameKind = (v.rhythm === "MONTHLY") === (rhythm === "MONTHLY");
      const payday = sameKind ? v.payday : rhythm === "MONTHLY" ? DEFAULT_PAYDAY.monthDay : DEFAULT_PAYDAY.weekday;
      return { ...v, rhythm, payday };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.consent) {
      setError("Tick the box to agree to payment requests and reminders");
      return;
    }
    setBusy(true);
    try {
      await sendJson("/api/join", "POST", { token, ...values });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="stack" role="status">
        <h2>Thank you</h2>
        <p className="muted">
          {businessName} will check your details. Once they approve, Thusa sends your payment request on your payday, with a
          link to pay from any bank.
        </p>
        <p className="muted small">You can close this page.</p>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <JoinNotice businessName={businessName} />
      <fieldset disabled={busy} className="form-grid">
        <div>
          <label htmlFor="parentName">Your name</label>
          <input
            id="parentName"
            value={values.parentName}
            onChange={(e) => setValues((v) => ({ ...v, parentName: e.target.value }))}
            autoComplete="name"
            required
            maxLength={80}
          />
        </div>
        {phoneMasked && (
          <p className="muted small">
            Payment requests and reminders go to the cellphone {businessName} has for you, ending{" "}
            <span className="num">{phoneMasked.replace(/^•+/, "")}</span>. If that&apos;s not your number, ask {businessName}{" "}
            to send a new link.
          </p>
        )}
        <fieldset>
          <legend className="legend-label">How often do you want to pay?</legend>
          <div className="choice-list">
            {options.map((o) => (
              <label key={o.rhythm} className="choice">
                <input type="radio" name="rhythm" checked={values.rhythm === o.rhythm} onChange={() => setRhythm(o.rhythm)} />
                <span className="choice-text">
                  <strong>{RHYTHM_LABEL[o.rhythm]}</strong>
                  <span className="num">
                    {formatRand(o.amountCents)} {EVERY[o.rhythm]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="payday">
            Your payday <span className="hint">Thusa asks you to pay on this day.</span>
          </label>
          <select
            id="payday"
            value={values.payday}
            onChange={(e) => setValues((v) => ({ ...v, payday: Number(e.target.value) }))}
          >
            {paydayOptions(values.rhythm).map((day) => (
              <option key={day} value={day}>
                {formatPayday(values.rhythm, day)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="language">Language for messages</label>
          <select
            id="language"
            value={values.language}
            onChange={(e) => setValues((v) => ({ ...v, language: e.target.value as Language }))}
          >
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="check">
            <input
              type="checkbox"
              checked={values.consent}
              onChange={(e) => setValues((v) => ({ ...v, consent: e.target.checked }))}
              required
            />
            <span>{consentText}</span>
          </label>
          <ConsentLinks />
        </div>
      </fieldset>
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="block" disabled={busy}>
        {busy ? "Sending…" : `Send to ${businessName}`}
      </button>
    </form>
  );
}
