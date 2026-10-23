"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGE_NAMES, PROVINCES } from "@/lib/business-options";
import { sendJson } from "./api-client";

type BusinessValues = {
  name: string;
  town: string | null;
  province: string;
  ecdRegistrationNumber: string | null;
  defaultLanguage: string;
};

type Props = { mode: "create"; initial?: undefined; readOnly?: undefined } | { mode: "update"; initial: BusinessValues; readOnly?: boolean };

export function BusinessForm({ mode, initial, readOnly = false }: Props) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: initial?.name ?? "",
    town: initial?.town ?? "",
    province: initial?.province ?? "",
    ecdRegistrationNumber: initial?.ecdRegistrationNumber ?? "",
    defaultLanguage: initial?.defaultLanguage ?? "en",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setSaved(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendJson("/api/business", mode === "create" ? "POST" : "PATCH", values);
      if (mode === "create") router.replace("/dashboard");
      else setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <fieldset disabled={readOnly || busy} className="form-grid two">
        <div className="full">
          <label htmlFor="name">Business name</label>
          <input id="name" value={values.name} onChange={set("name")} autoComplete="organization" required maxLength={100} />
        </div>
        <div>
          <label htmlFor="town">
            Town or suburb <span className="hint">Optional</span>
          </label>
          <input id="town" value={values.town} onChange={set("town")} autoComplete="address-level2" maxLength={80} />
        </div>
        <div>
          <label htmlFor="province">Province</label>
          <select id="province" value={values.province} onChange={set("province")} required>
            <option value="" disabled>
              Choose a province
            </option>
            {Object.entries(PROVINCES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ecd">
            ECD registration number <span className="hint">Optional. Helps with subsidy applications later.</span>
          </label>
          <input id="ecd" value={values.ecdRegistrationNumber} onChange={set("ecdRegistrationNumber")} maxLength={40} />
        </div>
        <div>
          <label htmlFor="lang">
            Language for parent messages <span className="hint">You can change this per parent later.</span>
          </label>
          <select id="lang" value={values.defaultLanguage} onChange={set("defaultLanguage")}>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      {readOnly && <p className="muted">Only the owner can change the business profile.</p>}
      {error && (
        <p className="message problem" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="message" role="status">
          Saved.
        </p>
      )}
      {!readOnly && (
        <button type="submit" className={mode === "create" ? "block" : undefined} disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Continue" : "Save changes"}
        </button>
      )}
    </form>
  );
}
