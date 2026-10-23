import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { WhosPaid } from "@/components/dashboard/whos-paid";
import { CheckIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { demoLogin, formatSaMobile } from "@/lib/auth/demo";
import { summariseParents } from "@/lib/dashboard";
import { SAMPLE_TODAY, sampleCollections } from "@/lib/sample-dashboard";
import { LoginForm } from "./login-form";

const TRUST_POINTS = [
  "No password to remember. We send a one-time code to your phone.",
  "Thusa will never ask for your PIN or banking password.",
  "Parents never pay Thusa fees, and there are no late fees.",
];

function LoginAside() {
  const preview = summariseParents(sampleCollections(), SAMPLE_TODAY);
  return (
    <>
      <div className="stack-tight">
        <h2 className="aside-title">Know who&apos;s paid at a glance.</h2>
        <p className="muted">Every parent, every payday, in one place.</p>
      </div>
      <div aria-label="Preview of the Who's paid panel, with sample data">
        <WhosPaid parents={preview} isSample />
      </div>
      <ul className="trust">
        {TRUST_POINTS.map((t) => (
          <li key={t}>
            <span className="trust-icon">
              <CheckIcon size={14} />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const demo = demoLogin();
  return (
    <AuthFrame aside={<LoginAside />}>
      <LoginForm
        showDevOutbox={process.env.NODE_ENV !== "production"}
        demo={demo && { phone: formatSaMobile(demo.phoneE164), phoneE164: demo.phoneE164, code: demo.code }}
      />
    </AuthFrame>
  );
}
