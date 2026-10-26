import Link from "next/link";

// Links to the terms of use and the privacy notice: in every footer, and beside every consent tick box.

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav className={className ? `legal-links ${className}` : "legal-links"} aria-label="Legal">
      <Link href="/terms">Terms of use</Link>
      <span aria-hidden="true">·</span>
      <Link href="/privacy">Privacy notice</Link>
    </nav>
  );
}

/**
 * Goes right after a consent tick box, outside its label (so tapping a link never ticks the box). Opens in a
 * new tab, so a half-filled form isn't lost.
 */
export function ConsentLinks() {
  return (
    <p className="consent-links">
      Read the{" "}
      <Link href="/terms" target="_blank" rel="noopener">
        terms of use<span className="sr-only"> (opens in a new tab)</span>
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" target="_blank" rel="noopener">
        privacy notice<span className="sr-only"> (opens in a new tab)</span>
      </Link>
      .
    </p>
  );
}
