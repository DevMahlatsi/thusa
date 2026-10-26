"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { splitMonthlyFee } from "@/lib/fee-split";
import { formatRand, parseRandToCents } from "@/lib/money";
import { sendJson } from "./api-client";

/** The owner's side of an invite: the parent's number, the child and the fees. Opens the invite's page to share it. */
export function InviteForm() {
  const router = useRouter();
  const [values, setValues] = useState({ phone: "", childName: "", amount: "" });
  const [parentAgreed, setParentAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const monthlyAmountCents = parseRandToCents(values.amount);
  // A preview only: the server works the amounts out again and the parent never sends one.
  const preview = monthlyAmountCents && monthlyAmountCents >= 100 ? monthlyAmountCents : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (monthlyAmountCents === null || monthlyAmountCents === 0) {
      setError("Enter the school fees in rand, like 1200 or 1 250.50");
      return;
    }
    if (!parentAgreed) {
      setError("Tick the box to confirm the parent agreed");
      return;
    }
    setBusy(true);
    try {
      const { invite } = await sendJson<{ invite: { id: string } }>("/api/invites", "POST", {
        phone: values.phone,
        childName: values.childName,
        monthlyAmountCents,
        parentAgreed,
      });
      router.push(`/parents/invites/${invite.id}`);
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
          <label htmlFor="phone">
            Parent&apos;s cellphone <span className="hint">Payment requests and reminders go here.</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={set("phone")}
            placeholder="082 123 4567"
            autoComplete="off"
            required
            maxLength={20}
          />
        </div>
        <div>
          <label htmlFor="childName">Child&apos;s name</label>
          <input id="childName" value={values.childName} onChange={set("childName")} autoComplete="off" required maxLength={80} />
        </div>
        <div>
          <label htmlFor="amount">
            School fees per month <span className="hint">The parent can&apos;t change it.</span>
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
        <p className="muted small full num" aria-live="polite">
          The parent chooses to pay monthly, fortnightly or weekly
          {preview
            ? `: ${formatRand(preview)}, ${formatRand(splitMonthlyFee(preview, "FORTNIGHTLY"))} or ${formatRand(splitMonthlyFee(preview, "WEEKLY"))}.`
            : "."}{" "}
          A year&apos;s fees come to the same either way.
        </p>
        <div className="full">
          <label className="check" htmlFor="parentAgreed">
            <input id="parentAgreed" type="checkbox" checked={parentAgreed} onChange={(e) => setParentAgreed(e.target.checked)} />
            <span>
              The parent agreed that I can give Thusa their cellphone number so I can send them this link. Thusa won&apos;t
              message them until they&apos;ve signed up and I&apos;ve approved them.
            </span>
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Making the link…" : "Make invite link"}
        </button>
        <Link href="/parents" className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
