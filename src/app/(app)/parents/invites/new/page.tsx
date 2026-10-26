import { redirect } from "next/navigation";
import { InviteForm } from "@/components/invite-form";
import { requirePageBusinessUser } from "@/lib/auth";

export default async function NewInvitePage() {
  const { role } = await requirePageBusinessUser();
  if (role === "READONLY") redirect("/parents");
  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="new-invite-title">
        <div className="panel-header">
          <div>
            <h2 id="new-invite-title">Invite a parent</h2>
            <p className="subtitle">
              Thusa makes a link for the parent to add their own details and payday. You approve them before any payment
              request goes out.
            </p>
          </div>
        </div>
        <InviteForm />
      </section>
    </div>
  );
}
