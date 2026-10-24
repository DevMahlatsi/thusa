"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OverviewIcon, ParentsIcon, ProfileIcon, RemindersIcon } from "../icons";

type NavEntry = {
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number }>;
  // Null until the page exists (demo priorities 2–5); rendered as "Soon", never as a dead link.
  href: string | null;
  title: string;
  inBottomNav: boolean;
};

export const NAV: NavEntry[] = [
  { label: "Overview", shortLabel: "Overview", icon: OverviewIcon, href: "/dashboard", title: "Overview", inBottomNav: true },
  { label: "Parents", shortLabel: "Parents", icon: ParentsIcon, href: "/parents", title: "Parents", inBottomNav: true },
  // Collections (CollectionsIcon) is hidden until its page exists: see docs/ROADMAP.md step 10.5.
  { label: "Messages", shortLabel: "Messages", icon: RemindersIcon, href: "/messages", title: "Messages", inBottomNav: true },
  {
    label: "Business profile",
    shortLabel: "Profile",
    icon: ProfileIcon,
    href: "/settings/business",
    title: "Business profile",
    inBottomNav: true,
  },
];

function NavItem({ entry, variant }: { entry: NavEntry; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const Icon = entry.icon;
  const label = variant === "sidebar" ? entry.label : entry.shortLabel;
  const icon = variant === "bottom" ? <span className="nav-icon"><Icon size={20} /></span> : <Icon size={18} />;

  if (!entry.href) {
    return (
      <span className="nav-item" aria-disabled="true" title="Coming soon">
        {icon}
        {label}
        {variant === "sidebar" ? <span className="soon">Soon</span> : <span className="sr-only"> (coming soon)</span>}
      </span>
    );
  }
  const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  return (
    <Link href={entry.href} className="nav-item" aria-current={active ? "page" : undefined}>
      {icon}
      {label}
    </Link>
  );
}

export function SidebarNav() {
  return (
    <nav className="sidebar-section" aria-label="Main">
      <span className="sidebar-label">Menu</span>
      {NAV.map((entry) => (
        <NavItem key={entry.label} entry={entry} variant="sidebar" />
      ))}
    </nav>
  );
}

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.filter((e) => e.inBottomNav).map((entry) => (
        <NavItem key={entry.label} entry={entry} variant="bottom" />
      ))}
    </nav>
  );
}

export function PageTitle() {
  const pathname = usePathname();
  const entry = NAV.find((e) => e.href && (pathname === e.href || pathname.startsWith(`${e.href}/`)));
  return <h1>{entry?.title ?? "Thusa"}</h1>;
}
