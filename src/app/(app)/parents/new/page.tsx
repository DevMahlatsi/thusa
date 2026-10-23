import { redirect } from "next/navigation";
import { PayerForm } from "@/components/payer-form";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness } from "@/lib/business";
import { todayInSa } from "@/lib/payers";

export default async function NewParentPage() {
  const { businessId, role } = await requirePageBusinessUser();
  if (role === "READONLY") redirect("/parents");
  const business = await getBusiness(businessId);
  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="new-parent-title">
        <div className="panel-header">
          <div>
            <h2 id="new-parent-title">Add a parent</h2>
            <p className="subtitle">Add them once. Thusa asks them to pay on their payday.</p>
          </div>
        </div>
        <PayerForm defaultLanguage={business?.defaultLanguage ?? "en"} today={todayInSa()} />
      </section>
    </div>
  );
}
