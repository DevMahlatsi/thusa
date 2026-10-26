import Link from "next/link";
import { contactEmail, LEGAL_UPDATED, PROTOTYPE_NOTICE } from "@/lib/legal";
import { InfoIcon } from "./icons";
import { LegalLinks } from "./legal-links";
import { PublicHeader } from "./public-header";

// Frame for /terms and /privacy: public, readable on a phone, with the prototype warning above the text.

export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <PublicHeader>
        <Link href="/" className="button secondary small">
          Back to home
        </Link>
      </PublicHeader>
      <main className="legal">
        <p className="legal-notice" role="note">
          <InfoIcon size={16} />
          <span>{PROTOTYPE_NOTICE}</span>
        </p>
        <article className="panel legal-doc">
          <header className="legal-head">
            <h1>{title}</h1>
            <p className="muted small">Last updated {LEGAL_UPDATED}</p>
            <p>{intro}</p>
          </header>
          {children}
        </article>
        <LegalLinks className="centred" />
      </main>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** The contact address, or what to do until there is one. */
export function ContactLine() {
  const email = contactEmail();
  if (email) {
    return (
      <p>
        Email <a href={`mailto:${email}`}>{email}</a>.
      </p>
    );
  }
  return <p>Thusa&apos;s contact email isn&apos;t set up yet. Until it is, please contact the business that invited you.</p>;
}
