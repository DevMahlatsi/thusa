import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { WhosPaid } from "@/components/dashboard/whos-paid";
import { CollectionsIcon, InfoIcon, OverviewIcon, ParentsIcon, RemindersIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { demoLogin } from "@/lib/auth/demo";
import { summariseParents } from "@/lib/dashboard";
import { SAMPLE_TODAY, sampleCollections } from "@/lib/sample-dashboard";

// Public landing page. Logged-in users skip it and go straight into the app.

const NBSP = " ";

// ECD Census 2021 (docs/PRODUCT.md).
const FACTS = [
  { figure: `42${NBSP}420`, label: "early learning programmes in South Africa" },
  { figure: "70%", label: "rely mainly on fees from parents to keep going" },
  { figure: `R${NBSP}509`, label: "average fee per child per month" },
];

const STEPS = [
  {
    icon: ParentsIcon,
    title: "Add each parent once",
    body: "Child's name, parent's phone number, the fee, and when that parent gets paid.",
  },
  {
    icon: CollectionsIcon,
    title: "Thusa asks on payday",
    body: "A payment request goes out weekly, fortnightly or monthly, timed to each parent's payday. They pay from any bank.",
  },
  {
    icon: OverviewIcon,
    title: "Payments match themselves",
    body: "Every request has its own reference, so payments are matched and confirmed for you. No more checking statements.",
  },
  {
    icon: RemindersIcon,
    title: "Polite reminders, if needed",
    body: "A friendly WhatsApp or SMS in English, isiZulu, Sesotho or Setswana. Never a late fee.",
  },
];

const FEATURES = [
  {
    title: "Fees that fit a weekly wage",
    body: "Split a monthly fee into weekly or fortnightly amounts that add up to the same total.",
  },
  {
    title: "Part-payments welcome",
    body: "A parent can pay some now and the rest later. Thusa keeps track of what is still owed.",
  },
  {
    title: "Who's paid, at a glance",
    body: "Expected, received and outstanding for the month, with every parent's status in one list.",
  },
  {
    title: "Scam-safe messages",
    body: "Parents only get fixed, recognisable messages. Thusa never asks for a PIN or banking password.",
  },
  {
    title: "Parents pay nothing extra",
    body: "No Thusa fees for parents, and no late fees or penalties. Ever.",
  },
  {
    title: "Light on data",
    body: "Works on any smartphone browser, with large text and amounts that never rely on colour alone.",
  },
];

const PLANS = [
  { name: "Starter", price: "Free", per: "", limit: "Up to 5 parents" },
  { name: "Standard", price: `R${NBSP}99`, per: "/ month", limit: "Up to 50 parents", key: true },
  { name: "Plus", price: `R${NBSP}199`, per: "/ month", limit: "More than 50 parents" },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.businessId ? "/dashboard" : "/onboarding");

  const hasDemo = demoLogin() !== null;
  const preview = summariseParents(sampleCollections(), SAMPLE_TODAY);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-wrap landing-bar">
          <Link href="/" className="logo" aria-label="Thusa home">
            <Wordmark height={28} />
          </Link>
          <nav className="landing-actions" aria-label="Account">
            <Link href="/login" className="button secondary small">
              Log in
            </Link>
            <Link href="/login" className="button small">
              Try the demo
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-wrap hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="tag">For crèches and ECD centres</span>
            <h1 id="hero-title">Get paid on your parents&apos; payday.</h1>
            <p className="lead">
              Thusa collects school fees weekly, fortnightly or monthly, timed to when each parent is paid. It matches
              every payment, sends polite reminders, and shows you who&apos;s paid.
            </p>
            <div className="hero-actions">
              <Link href="/login" className="button">
                Try the live demo
              </Link>
              <a href="#how-it-works" className="button secondary">
                See how it works
              </a>
            </div>
            {hasDemo && (
              <p className="muted small">Judging Thusa? The demo phone number and code are on the login page.</p>
            )}
          </div>
          <div className="hero-preview" aria-label="Preview of the Who's paid panel, with sample data">
            <WhosPaid parents={preview} isSample />
          </div>
        </section>

        <section className="landing-wrap landing-section" aria-labelledby="why-title">
          <div className="section-intro">
            <h2 id="why-title">Fees keep the doors open. Collecting them shouldn&apos;t be a second job.</h2>
            <p className="muted">
              Many parents are paid weekly or from several small jobs, but fees are due once a month. The result is
              late, partial payments, and owners chasing money over WhatsApp.
            </p>
          </div>
          <div className="facts">
            {FACTS.map((f) => (
              <div className="panel" key={f.label}>
                <p className="figure num">{f.figure}</p>
                <p className="muted small">{f.label}</p>
              </div>
            ))}
          </div>
          <p className="muted small">Source: ECD Census 2021.</p>
        </section>

        <section id="how-it-works" className="landing-wrap landing-section" aria-labelledby="how-title">
          <div className="section-intro">
            <h2 id="how-title">How it works</h2>
            <p className="muted">Set it up once. Thusa does the asking, matching and reminding.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li className="panel" key={s.title}>
                <div className="step-head">
                  <span className="avatar" aria-hidden="true">
                    <s.icon size={18} />
                  </span>
                  <span className="muted small">Step {i + 1}</span>
                </div>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-wrap landing-section" aria-labelledby="features-title">
          <div className="section-intro">
            <h2 id="features-title">Built for how parents actually get paid</h2>
          </div>
          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-wrap landing-section" aria-labelledby="pricing-title">
          <div className="section-intro">
            <h2 id="pricing-title">Simple pricing</h2>
            <p className="muted">
              Plus 2.5% per successful collection (minimum R{NBSP}2, maximum R{NBSP}15). Parents pay nothing.
            </p>
          </div>
          <div className="plans">
            {PLANS.map((p) => (
              <div className="panel plan" key={p.name}>
                <div className="plan-head">
                  <h3>{p.name}</h3>
                  {p.key && <span className="tag">Recommended</span>}
                </div>
                <p className="figure num">
                  {p.price} {p.per && <span className="figure-of">{p.per}</span>}
                </p>
                <p className="muted small">{p.limit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-wrap landing-section">
          <div className="cta-band">
            <h2>See it with a real account</h2>
            <p>Log in to the live demo crèche and look around. No sign-up needed.</p>
            <Link href="/login" className="button secondary">
              Open the demo
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-wrap landing-footer">
        <p className="sandbox-note">
          <InfoIcon size={16} />
          <span>
            Hackathon preview: payments run in a sandbox and no real money moves yet. Built for the FNB App of the Year
            Hackathon 2026.
          </span>
        </p>
        <p>
          <em>Thusa</em> means &ldquo;help&rdquo; in Sesotho and Setswana. Thusa will never ask for your PIN or banking
          password.
        </p>
      </footer>
    </div>
  );
}
