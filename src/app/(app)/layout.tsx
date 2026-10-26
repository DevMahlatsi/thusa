import Link from "next/link";
import { BrandIcon, Wordmark } from "@/components/brand";
import { LegalLinks } from "@/components/legal-links";
import { LogoutButton } from "@/components/logout-button";
import { BottomNav, PageTitle, SidebarNav } from "@/components/shell/nav";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness } from "@/lib/business";
import { initials } from "@/lib/initials";

const ROLE_LABEL = { OWNER: "Owner", STAFF: "Staff", READONLY: "View only" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { businessId, role } = await requirePageBusinessUser();
  const business = await getBusiness(businessId);
  const name = business?.name ?? "Your business";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <Link href="/dashboard" className="logo">
            <Wordmark />
          </Link>
          <SidebarNav />
          <div className="sidebar-footer">Parents never pay Thusa fees.</div>
        </div>
      </aside>

      <div>
        <header className="topbar">
          <div className="topbar-title">
            <span className="logo-mark">
              <BrandIcon />
            </span>
            <PageTitle />
          </div>
          <div className="topbar-actions">
            <div className="account">
              <span className="avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <div className="account-text">
                <strong>{name}</strong>
                <span className="muted small">{ROLE_LABEL[role]}</span>
              </div>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="content">
          {children}
          {/* Inside main, so on phones it stays clear of the fixed bottom nav. */}
          <LegalLinks className="centred app-legal" />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
