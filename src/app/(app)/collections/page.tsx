import Link from "next/link";
import { CollectionsTable } from "@/components/dashboard/recent-collections";
import { CollectionsIcon } from "@/components/icons";
import { requirePageBusinessUser } from "@/lib/auth";
import { firstDueDate, listCollectionRows } from "@/lib/collections";
import {
  addMonths,
  collectionsHref,
  compareMonths,
  filterRows,
  parseCollectionsQuery,
  statusCounts,
  type Month,
  type StatusFilter,
} from "@/lib/collections-view";
import { computeKpis, mergeWithProjected, projectSchedules } from "@/lib/dashboard";
import { formatRand } from "@/lib/money";
import { isDemoBusiness } from "@/lib/parent-messages";
import { listPayers, todayInSa } from "@/lib/payers";
import { whatsAppEnabled } from "@/messaging/adapter";

export const dynamic = "force-dynamic";

// Every fee in one month, not just the dashboard's latest ten. This month and next also show due dates
// that have no payment request yet (from each schedule); past months show only what was requested.

const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  paid: "Paid",
  partial: "Partial",
  pending: "Pending",
  failed: "Failed",
};

const monthLabel = ({ year, month }: Month) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });

const toMonth = (ymd: string): Month => ({ year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CollectionsPage({ searchParams }: Props) {
  const { businessId, role } = await requirePageBusinessUser();
  const today = todayInSa();
  const current = toMonth(today);

  // Names and schedules only: phones are never decrypted here.
  const [payers, first] = await Promise.all([listPayers(businessId), firstDueDate(businessId)]);
  const scheduled = payers.map((p) => ({
    id: p.id,
    parentName: p.parentName,
    childName: p.childName,
    schedule: p.schedule && {
      amountCents: p.schedule.amountCents,
      rhythm: p.schedule.rhythm,
      payday: p.schedule.payday,
      startsOn: p.schedule.startsOn.toISOString().slice(0, 10),
    },
  }));

  if (!scheduled.some((p) => p.schedule) && !first) {
    return (
      <section className="panel empty-state" aria-labelledby="empty-title">
        <span className="empty-icon">
          <CollectionsIcon size={24} />
        </span>
        <h2 id="empty-title">No collections yet</h2>
        <p className="muted">
          Every fee Thusa asks a parent for shows here, month by month, with what was paid. Add your parents and their
          schedules to get started.
        </p>
        <Link href="/parents" className="button">
          Go to parents
        </Link>
      </section>
    );
  }

  const earliest = first && compareMonths(toMonth(first), current) < 0 ? toMonth(first) : current;
  const { month, status } = parseCollectionsQuery(await searchParams, current, earliest);
  const requested = await listCollectionRows(businessId, month.year, month.month);
  const all = (
    compareMonths(month, current) >= 0 ? mergeWithProjected(requested, projectSchedules(scheduled, month.year, month.month)) : requested
  ).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.parentName.localeCompare(b.parentName, "en-ZA"));
  const rows = filterRows(all, status);
  const counts = statusCounts(all);
  const kpis = computeKpis(all, today);

  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const hasPrev = compareMonths(prev, earliest) >= 0;
  const hasNext = compareMonths(next, addMonths(current, 1)) <= 0;
  const label = monthLabel(month);
  // The judges' demo: a sent, unpaid request can be seen as its WhatsApp message, or sent to their own
  // WhatsApp once WhatsApp is switched on.
  const whatsApp = role !== "READONLY" && (await isDemoBusiness(businessId)) ? (whatsAppEnabled() ? "send" : "preview") : undefined;
  // Failed only shows up as a filter once there is a failed fee; the others are always offered.
  const filters = (["all", "paid", "partial", "pending", "failed"] as const).filter((f) => f !== "failed" || counts.failed > 0);

  return (
    <section className="panel" aria-labelledby="collections-title">
      <div className="panel-header">
        <div>
          <h2 id="collections-title">Collections</h2>
          <p className="subtitle">
            {compareMonths(month, current) >= 0
              ? `Every fee due in ${label}, sent or not`
              : `Every payment request for fees due in ${label}`}
          </p>
        </div>
        <nav className="month-nav" aria-label="Month">
          {hasPrev ? (
            <Link href={collectionsHref(prev, status, current)} className="button secondary small" aria-label={`Previous month, ${monthLabel(prev)}`}>
              ‹
            </Link>
          ) : (
            <span className="button secondary small" aria-disabled="true">
              ‹
            </span>
          )}
          <span className="month-label">{label}</span>
          {hasNext ? (
            <Link href={collectionsHref(next, status, current)} className="button secondary small" aria-label={`Next month, ${monthLabel(next)}`}>
              ›
            </Link>
          ) : (
            <span className="button secondary small" aria-disabled="true">
              ›
            </span>
          )}
        </nav>
      </div>

      <p className="figure num">
        {formatRand(kpis.receivedCents)} <span className="figure-of">of {formatRand(kpis.expectedCents)} received</span>
      </p>

      <nav className="filter-tabs" aria-label="Filter by status">
        {filters.map((f) => (
          <Link key={f} href={collectionsHref(month, f, current)} aria-current={f === status ? "page" : undefined}>
            {FILTER_LABEL[f]} <span className="num">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="muted small">
          {all.length === 0
            ? `No fees in ${label}.`
            : `No ${FILTER_LABEL[status].toLowerCase()} fees in ${label}.`}
        </p>
      ) : (
        <CollectionsTable
          rows={rows}
          isSample={false}
          canSend={role !== "READONLY"}
          today={today}
          whatsApp={whatsApp}
        />
      )}
    </section>
  );
}
