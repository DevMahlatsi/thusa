import { Wordmark } from "./brand";

// Shared frame for pages outside the app shell (login, onboarding).
export function AuthFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`auth${wide ? " wide" : ""}`}>
      <span className="logo">
        <Wordmark height={32} />
      </span>
      <div className="panel">{children}</div>
      <p className="auth-footer">
        Thusa will never ask for your PIN or banking password. Parents never pay Thusa fees.
      </p>
    </main>
  );
}
