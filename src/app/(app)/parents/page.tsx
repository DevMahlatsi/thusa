import { ParentsIcon } from "@/components/icons";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness } from "@/lib/business";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { RHYTHM_LABEL } from "@/lib/dashboard";
import { initials } from "@/lib/initials";
import { formatRand } from "@/lib/money";
import { listPayers, toPayerDto } from "@/lib/payers";
import { formatPayday } from "@/lib/schedule-format";

// Disabled until the add/edit form exists (roadmap step 5); never a dead link.
function AddParentButton() {
  return (
    <button type="button" aria-disabled="true" title="Coming soon">
      Add parent
    </button>
  );
}

export default async function ParentsPage() {
  const { businessId } = await requirePageBusinessUser();
  const [business, payers] = await Promise.all([getBusiness(businessId), listPayers(businessId)]);
  const defaultLanguage = business?.defaultLanguage ?? "en";
  const rows = payers
    .map(toPayerDto)
    .sort((a, b) => a.parentName.localeCompare(b.parentName, "en-ZA") || a.childName.localeCompare(b.childName, "en-ZA"));

  if (rows.length === 0) {
    return (
      <section className="panel empty-state" aria-labelledby="empty-title">
        <span className="empty-icon">
          <ParentsIcon size={24} />
        </span>
        <h2 id="empty-title">No parents yet</h2>
        <p className="muted">
          Add each parent once with their child, phone number, fee and payday. Thusa then asks them to pay on that day,
          every week, fortnight or month.
        </p>
        <AddParentButton />
        <p className="muted small">Adding parents opens in the next update.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="parents-title">
      <div className="panel-header">
        <div>
          <h2 id="parents-title">Parents</h2>
          <p className="subtitle">Everyone Thusa collects fees from</p>
        </div>
        <AddParentButton />
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
