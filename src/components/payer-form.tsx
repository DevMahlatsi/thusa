"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import type { Rhythm } from "@/lib/dashboard";
import { centsToRandInput, parseRandToCents } from "@/lib/money";
import { formatPayday } from "@/lib/schedule-format";
import { sendJson } from "./api-client";

type Language = keyof typeof LANGUAGE_NAMES;

export type PayerFormValues = {
  id: string;
  parentName: string;
  childName: string;
  phoneMasked: string;
  language: Language | null;
  schedule: { amountCents: number; rhythm: Rhythm; payday: number; startsOn: string } | null;
};

type Props = {
  defaultLanguage: Language;
  today: string;
  initial?: PayerFormValues;
};

const RHYTHM_OPTIONS: { value: Rhythm; label: string }[] = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
];

// Most parents are paid on a Friday or on the 25th.
const DEFAULT_PAYDAY = { weekday: 5, monthDay: 25 };

const paydayOptions = (rhythm: Rhythm) =>
  rhythm === "MONTHLY" ? Array.from({ length: 31 }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 6, 7];

export function PayerForm({ defaultLanguage, today, initial }: Props) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [values, setValues] = useState({
    parentName: initial?.parentName ?? "",
    childName: initial?.childName ?? "",
    phone: "",
    language: initial?.language ?? "",
    amount: initial?.schedule ? centsToRandInput(initial.schedule.amountCents) : "",
    rhythm: initial?.schedule?.rhythm ?? ("MONTHLY" as Rhythm),
    payday: initial?.schedule?.payday ?? DEFAULT_PAYDAY.monthDay,
    startsOn: initial?.schedule?.startsOn ?? today,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: "parentName" | "childName" | "phone" | "language" | "amount" | "startsOn") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function setRhythm(e: React.ChangeEvent<HTMLSelectElement>) {
    const rhythm = e.target.value as Rhythm;
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
    const amountCents = parseRandToCents(values.amount);
    if (amountCents === null || amountCents === 0) {
      setError("Enter the fee in rand, like 350 or 350.50");
      return;
    }
    const phone = values.phone.trim();
    const body = {
      parentName: values.parentName,
      childName: values.childName,
      // When editing, a blank phone keeps the stored number.
      ...(phone || !editing ? { phone } : {}),
      language: values.language || null,
      schedule: { amountCents, rhythm: values.rhythm, payday: values.payday, startsOn: values.startsOn },
    };
    setBusy(true);
    try {
      if (initial) await sendJson(`/api/payers/${initial.id}`, "PATCH", body);
      else await sendJson("/api/payers", "POST", body);
      router.push("/parents");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <fieldset disabled={busy} className="form-grid two">
        <div>
          <label htmlFor="parentName">Parent&apos;s name</label>
          <input id="parentName" value={values.parentName} onChange={set("parentName")} autoComplete="off" required maxLength={80} />
        </div>
        <div>
          <label htmlFor="childName">Child&apos;s name</label>
          <input id="childName" value={values.childName} onChange={set("childName")} autoComplete="off" required maxLength={80} />
        </div>
        <div>
          <label htmlFor="phone">
            Parent&apos;s cellphone
            <span className="hint">
              {initial ? `Now ${initial.phoneMasked}. Leave blank to keep it.` : "Payment requests and reminders go here."}
            </span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={set("phone")}
            placeholder="082 123 4567"
            autoComplete="off"
            required={!editing}
            maxLength={20}
          />
        </div>
        <div>
          <label htmlFor="language">
            Message language <span className="hint">For requests and reminders to this parent.</span>
          </label>
          <select id="language" value={values.language} onChange={set("language")}>
            <option value="">Business default ({LANGUAGE_NAMES[defaultLanguage]})</option>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amount">
            Fee per collection <span className="hint">In rand, e.g. 350 or 1 250.50</span>
          </label>
          <div className="input-prefix">
            <span aria-hidden="true">R</span>
            <input
              id="amount"
              inputMode="decimal"
              value={values.amount}
              onChange={set("amount")}
              placeholder="0.00"
              autoComplete="off"
              required
              maxLength={16}
            />
          </div>
        </div>
        <div>
          <label htmlFor="rhythm">How often</label>
          <select id="rhythm" value={values.rhythm} onChange={setRhythm}>
            {RHYTHM_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="payday">
            Payday <span className="hint">Thusa asks the parent to pay on this day.</span>
          </label>
          <select id="payday" value={values.payday} onChange={(e) => setValues((v) => ({ ...v, payday: Number(e.target.value) }))}>
            {paydayOptions(values.rhythm).map((day) => (
              <option key={day} value={day}>
                {formatPayday(values.rhythm, day)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startsOn">
            Start collecting from
            <span className="hint">
              {values.rhythm === "FORTNIGHTLY" ? "Every second week is counted from this date." : "No requests go out before this date."}
            </span>
          </label>
          <input id="startsOn" type="date" value={values.startsOn} onChange={set("startsOn")} required />
        </div>
      </fieldset>
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add parent"}
        </button>
        <Link href="/parents" className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Two-step remove on the edit page. Archives: history stays, collections stop. */
export function ArchivePayerButton({ id, parentName }: { id: string; parentName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/payers/${id}`, "DELETE");
      router.push("/parents");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="secondary" onClick={() => setConfirming(true)}>
        Remove parent
      </button>
    );
  }
  return (
    <div className="stack-tight" role="group" aria-label="Confirm remove">
      <p>
        Remove {parentName}? Thusa stops asking them to pay. Their payment history stays.
      </p>
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={archive} disabled={busy}>
          {busy ? "Removing…" : "Yes, remove"}
        </button>
        <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          Keep
        </button>
      </div>
    </div>
  );
}
