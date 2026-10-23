import { notFound, redirect } from "next/navigation";
import { ArchivePayerButton, PayerForm } from "@/components/payer-form";
import { requirePageBusinessUser } from "@/lib/auth";
import { getBusiness } from "@/lib/business";
import { getPayer, payerIdSchema, todayInSa, toPayerDto } from "@/lib/payers";

export default async function EditParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { businessId, role } = await requirePageBusinessUser();
  if (role === "READONLY") redirect("/parents");
  const id = payerIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [business, payer] = await Promise.all([getBusiness(businessId), getPayer(businessId, id.data)]);
  if (!payer || payer.archivedAt) notFound();
  // Masked phone only: the full number never reaches the browser.
  const dto = toPayerDto(payer);
  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="edit-parent-title">
        <div className="panel-header">
          <div>
            <h2 id="edit-parent-title">{dto.parentName}</h2>
            <p className="subtitle">Parent of {dto.childName}</p>
          </div>
        </div>
        <PayerForm defaultLanguage={business?.defaultLanguage ?? "en"} today={todayInSa()} initial={dto} />
      </section>
      <section className="panel" aria-labelledby="remove-parent-title">
        <div className="panel-header">
          <div>
            <h2 id="remove-parent-title">Remove parent</h2>
            <p className="subtitle">For a child who has left. Their payment history stays.</p>
          </div>
        </div>
        <ArchivePayerButton id={dto.id} parentName={dto.parentName} />
      </section>
    </div>
  );
}
