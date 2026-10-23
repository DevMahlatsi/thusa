import Link from "next/link";
import { Wordmark } from "./brand";

// Header bar for public pages (landing, login, onboarding): logo on the left, page actions on the right.
export function PublicHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="landing-header">
      <div className="landing-wrap landing-bar">
        <Link href="/" className="logo" aria-label="Thusa home">
          <Wordmark height={28} />
        </Link>
        {children && <nav className="landing-actions" aria-label="Site">{children}</nav>}
      </div>
    </header>
  );
}
