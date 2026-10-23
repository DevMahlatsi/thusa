import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { BusinessForm } from "@/components/business-form";
import { requirePageUser } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await requirePageUser();
  if (user.businessId) redirect("/dashboard");
  return (
    <AuthFrame wide>
      <div className="stack">
        <div>
          <p className="muted small">Step 1 of 1</p>
          <h1>Tell us about your crèche</h1>
          <p className="muted">Parents will see this name on payment requests and reminders.</p>
        </div>
        <BusinessForm mode="create" />
      </div>
    </AuthFrame>
  );
}
