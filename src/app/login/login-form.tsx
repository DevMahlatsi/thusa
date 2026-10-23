"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/components/api-client";

export function LoginForm({ showDevOutbox }: { showDevOutbox: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendJson("/api/auth/otp/request", "POST", { phone });
      setStep("code");
      setCode("");
      setNotice("We sent a 6-digit code by SMS. It expires in 5 minutes.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { next } = await sendJson<{ next: string }>("/api/auth/otp/verify", "POST", { phone, code });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {step === "phone" ? (
        <form className="stack" onSubmit={requestCode}>
          <h1>Log in</h1>
          <div>
            <label htmlFor="phone">
              Cellphone number
              <span className="hint">We&apos;ll SMS you a code. No password needed.</span>
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="082 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="message problem" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="block" disabled={busy}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={verifyCode}>
          <h1>Enter your code</h1>
          {notice && (
            <p className="message" role="status">
              {notice}
            </p>
          )}
          <div>
            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              className="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="message problem" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="block" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Log in"}
          </button>
          <div>
            <button type="button" className="link" onClick={() => requestCode()} disabled={busy}>
              Send a new code
            </button>
            {" · "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              disabled={busy}
            >
              Use a different number
            </button>
          </div>
          {showDevOutbox && (
            <p className="muted small">
              Dev mode: no SMS is sent. Find the code in the{" "}
              <a href="/dev/outbox" target="_blank">
                dev outbox
              </a>
              .
            </p>
          )}
        </form>
      )}
      
    </div>
  );
}
