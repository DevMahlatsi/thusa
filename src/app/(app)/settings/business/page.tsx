import { notFound } from "next/navigation";
import { BusinessForm } from "@/components/business-form";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness, toBusinessDto } from "@/lib/business";
import { mask } from "@/lib/logger";

const ROLE_LABEL = { OWNER: "Owner", STAFF: "Staff", READONLY: "View only" } as const;

export default async function BusinessSettingsPage() {
  const { user, businessId, role } = await requirePageBusinessUser();
  const business = await getBusiness(businessId);
  if (!business) notFound();
  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="profile-title">
        <div className="panel-header">
          <div>
            <h2 id="profile-title">Business details</h2>
            <p className="subtitle">Shown to parents on payment requests and reminders</p>
          </div>
        </div>
        <BusinessForm mode="update" initial={toBusinessDto(business)} readOnly={role !== "OWNER"} />
      </section>
      <section className="panel" aria-labelledby="account-title">
        <div className="panel-header">
          <h2 id="account-title">Your login</h2>
        </div>
        <p>
          <span className="num">{mask(user.phoneE164)}</span> · {ROLE_LABEL[role]}
        </p>
        <p className="muted small">You log in with a code sent by SMS to this number.</p>
      </section>
    </div>
  );
}
