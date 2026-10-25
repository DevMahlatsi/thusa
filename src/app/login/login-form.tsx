"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/components/api-client";
import { normaliseSaMobile } from "@/lib/phone";

type Demo = { phone: string; phoneE164: string; code: string };

export function LoginForm({ showDevOutbox, demo }: { showDevOutbox: boolean; demo: Demo | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDemoPhone = (p: string) => demo !== null && normaliseSaMobile(p) === demo.phoneE164;
  const isDemo = isDemoPhone(phone);

  // The demo button passes the demo number directly, since state from setPhone isn't visible yet.
  async function requestCode(forPhone = phone) {
    setBusy(true);
    setError(null);
    try {
      await sendJson("/api/auth/otp/request", "POST", { phone: forPhone });
      setStep("code");
      if (demo && isDemoPhone(forPhone)) {
        // The demo code is printed on this page anyway; filling it in saves judges a step.
        setCode(demo.code);
        setNotice("Demo account: the code is filled in for you. Press Log in.");
      } else {
        setCode("");
        setNotice("We sent a 6-digit code by SMS. It expires in 5 minutes.");
      }
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

  if (step === "code") {
    return (
      <form className="stack" onSubmit={verifyCode}>
        <div className="form-heading">
          <h1>Enter your code</h1>
          <p className="muted">
            Sent to <span className="num">{phone}</span>
          </p>
        </div>
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
        <div className="form-links">
          <button type="button" className="link" onClick={() => requestCode()} disabled={busy}>
            Send a new code
          </button>
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
        {showDevOutbox && !isDemo && (
          <p className="muted small">
            Dev mode: no SMS is sent. Find the code in the{" "}
            <a href="/dev/outbox" target="_blank">
              dev outbox
            </a>
            .
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void requestCode();
        }}
      >
        <div className="form-heading">
          <h1>Welcome to Thusa</h1>
          <p className="muted">Log in or get started with your cellphone number.</p>
        </div>
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

      {demo && (
        <>
          <p className="divider">
            <span>or</span>
          </p>
          <section className="demo-card" aria-labelledby="demo-title">
            <div className="demo-card-head">
              <h2 id="demo-title">Judging Thusa?</h2>
              <span className="tag">Demo</span>
            </div>
            <p className="muted small">
              A shared demo crèche with made-up parents and four months of payments. Change anything: it&apos;s rebuilt
              every morning, and no SMS is ever sent.
            </p>
            <dl className="demo-details">
              <div>
                <dt>Number</dt>
                <dd className="num">{demo.phone}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd className="num">{demo.code}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="secondary block"
              onClick={() => {
                setPhone(demo.phone);
                void requestCode(demo.phone);
              }}
              disabled={busy}
            >
              Log in with the demo account
            </button>
          </section>
        </>
      )}
    </div>
  );
}
