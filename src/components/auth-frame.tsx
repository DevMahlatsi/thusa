import Link from "next/link";
import { LegalLinks } from "./legal-links";
import { PublicHeader } from "./public-header";

// Shared frame for pages outside the app shell (login, onboarding). The optional aside sits beside
// the form on desktop and is hidden on smaller screens, where the form is all that matters.
// The legal links stay on every screen size, even where the aside hides the footer text.
export function AuthFrame({
  children,
  aside,
  wide = false,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="auth-page">
      <PublicHeader>
        <Link href="/" className="button secondary small">
          Back to home
        </Link>
      </PublicHeader>
      <main className={`auth${wide ? " wide" : ""}${aside ? " with-aside" : ""}`}>
        <div className="auth-form">
          <div className="panel">{children}</div>
          <p className="auth-footer">
            Thusa will never ask for your PIN or banking password. Parents never pay Thusa fees.
          </p>
          <LegalLinks />
        </div>
        {aside && <aside className="auth-aside">{aside}</aside>}
      </main>
    </div>
  );
}
