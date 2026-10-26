import Link from "next/link";
import { ActionButton } from "@/components/dashboard/action-button";
import { ParentsIcon } from "@/components/icons";
import { answersText, InvitePill } from "@/components/invite-view";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness } from "@/lib/business";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { RHYTHM_LABEL } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { listPendingInvites, toInviteDto, type InviteDto } from "@/lib/invites";
import { formatRand } from "@/lib/money";
import { listPayers, toPayerDto } from "@/lib/payers";
import { formatPayday } from "@/lib/schedule-format";
import { smsDate } from "@/messaging/templates/format";

function AddParentButtons() {
  return (
    <div className="panel-tools">
      <Link href="/parents/invites/new" className="button secondary">
        Invite a parent
      </Link>
      <Link href="/parents/new" className="button">
        Add parent
      </Link>
    </div>
  );
}

// Parents who used an invite link. They aren't payers yet, so no request or reminder can reach them.
function AwaitingApproval({ invites, canEdit }: { invites: InviteDto[]; canEdit: boolean }) {
  return (
    <section className="panel" aria-labelledby="awaiting-title">
      <div className="panel-header">
        <div>
          <h2 id="awaiting-title">Awaiting approval</h2>
          <p className="subtitle">Parents who added themselves with an invite link. Nothing is sent to them until you approve.</p>
        </div>
      </div>
      <ul className="invite-list">
        {invites.map((i) => {
          const a = i.answers!;
          return (
            <li key={i.id}>
              <span className="avatar" aria-hidden="true">
                {initials(a.parentName ?? "")}
              </span>
              <div className="who">
                <strong>{a.parentName}</strong>
                <span>
                  Parent of {i.childName} · {answersText(a, i.phoneMasked)}
                </span>
              </div>
              <div className="what">
                <span className="amount num">
                  {formatRand(a.amountCents)} <span>{RHYTHM_LABEL[a.rhythm]}</span>
                </span>
                <InvitePill state={i.state} />
              </div>
              <div className="row-actions">
                {canEdit && (
                  <ActionButton
                    url={`/api/invites/${i.id}/approve`}
                    body={{}}
                    label="Approve"
                    busyLabel="Approving…"
                    ariaLabel={`Approve ${a.parentName}`}
                  />
                )}
                <Link href={`/parents/invites/${i.id}`} className="button secondary small">
                  Review<span className="sr-only"> {a.parentName}</span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InviteLinks({ invites }: { invites: InviteDto[] }) {
  return (
    <section className="panel" aria-labelledby="links-title">
      <div className="panel-header">
        <div>
          <h2 id="links-title">Invite links</h2>
          <p className="subtitle">Sent, and not used yet. Each link works once, for 7 days.</p>
        </div>
      </div>
      <ul className="invite-list">
        {invites.map((i) => (
          <li key={i.id}>
            <div className="who">
              <strong>{i.childName}</strong>
              <span className="num">
                {[i.phoneMasked, `${formatRand(i.monthlyAmountCents)} a month`, `${i.state === "OPEN" ? "until" : "expired"} ${smsDate(i.expiresOn)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="what">
              <InvitePill state={i.state} />
            </div>
            <div className="row-actions">
              <Link href={`/parents/invites/${i.id}`} className="button secondary small">
                {i.state === "OPEN" ? "Share" : "View"}
                <span className="sr-only"> the invite for {i.childName}</span>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ParentsPage() {
  const { businessId, role } = await requirePageBusinessUser();
  const canEdit = role !== "READONLY";
  const now = new Date();
  const [business, payers, invites] = await Promise.all([
    getBusiness(businessId),
    listPayers(businessId),
    listPendingInvites(businessId, now),
  ]);
  const defaultLanguage = business?.defaultLanguage ?? "en";
  const rows = payers
    .map(toPayerDto)
    .sort((a, b) => a.parentName.localeCompare(b.parentName, "en-ZA") || a.childName.localeCompare(b.childName, "en-ZA"));
  const inviteRows = invites.map((i) => toInviteDto(i, now));
  const awaiting = inviteRows.filter((i) => i.state === "AWAITING_APPROVAL" && i.answers);
  const links = inviteRows.filter((i) => i.state === "OPEN" || i.state === "EXPIRED");

  return (
    <div className="stack">
      {awaiting.length > 0 && <AwaitingApproval invites={awaiting} canEdit={canEdit} />}
      {rows.length === 0 ? (
        <section className="panel empty-state" aria-labelledby="empty-title">
          <span className="empty-icon">
            <ParentsIcon size={24} />
          </span>
          <h2 id="empty-title">No parents yet</h2>
          <p className="muted">
            Add each parent once with their child, phone number, fee and payday, or send them an invite link to add
            themselves. Thusa then asks them to pay on that day, every week, fortnight or month.
          </p>
          {canEdit ? <AddParentButtons /> : <p className="muted small">Only the owner or staff can add parents.</p>}
        </section>
      ) : (
        <section className="panel" aria-labelledby="parents-title">
          <div className="panel-header">
            <div>
              <h2 id="parents-title">Parents</h2>
              <p className="subtitle">Everyone Thusa collects fees from</p>
            </div>
            {canEdit && <AddParentButtons />}
          </div>
          <p className="figure">
            {rows.length} <span className="figure-of">{rows.length === 1 ? "parent" : "parents"}</span>
          </p>
          <div className="table-wrap">
            <table className="table responsive parents-table">
              <thead>
                <tr>
                  <th scope="col">Parent</th>
                  <th scope="col">Child</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Payday</th>
                  <th scope="col">Language</th>
                  <th scope="col" className="right">
                    Amount
                  </th>
                  {canEdit && (
                    <th scope="col" className="right">
                      <span className="sr-only">Action</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const payday = p.schedule ? formatPayday(p.schedule.rhythm, p.schedule.payday) : "No schedule";
                  const language = LANGUAGE_NAMES[p.language ?? defaultLanguage];
                  return (
                    <tr key={p.id}>
                      <td data-col="parent">
                        <span className="parent">
                          <span className="avatar" aria-hidden="true">
                            {initials(p.parentName)}
                          </span>
                          {p.parentName}
                        </span>
                      </td>
                      <td data-col="meta">
                        {p.childName} · {payday} · {p.phoneMasked}
                      </td>
                      <td data-col="child">{p.childName}</td>
                      <td data-col="phone" className="num">
                        {p.phoneMasked}
                      </td>
                      <td data-col="payday">{payday}</td>
                      <td data-col="language">
                        {language}
                        {p.language === null && <span className="muted"> (default)</span>}
                      </td>
                      <td data-col="amount" className="right amount">
                        {p.schedule ? (
                          <>
                            {formatRand(p.schedule.amountCents)}
                            <span>{RHYTHM_LABEL[p.schedule.rhythm]}</span>
                          </>
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                      {canEdit && (
                        <td data-col="action" className="right">
                          <Link href={`/parents/${p.id}/edit`} className="button secondary small">
                            Edit<span className="sr-only"> {p.parentName}</span>
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {links.length > 0 && <InviteLinks invites={links} />}
    </div>
  );
}
