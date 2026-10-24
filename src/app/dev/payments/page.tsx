import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requirePageBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRand } from "@/lib/money";
import { handlePaymentWebhook } from "@/lib/payment-webhooks";
import { mockProvider, simulatePayment } from "@/payments/mock";

export const dynamic = "force-dynamic";

// Development only: pretend a parent paid a mock payment request. It sends a signed mock webhook through
// the real webhook handler, so signature, dedupe, reconfirmation and the ledger all run as they would
// for Stitch.

async function payInFull(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") notFound();
  const { businessId, role } = await requirePageBusinessUser();
  if (role === "READONLY") redirect("/dev/payments");
  const id = z.uuid().safeParse(formData.get("collectionId"));
  if (!id.success) notFound();
  const collection = await db().collection.findFirst({
    where: { id: id.data, businessId, provider: "mock", providerRequestId: { not: null } },
  });
  if (!collection?.providerRequestId) notFound();
  const { rawBody, headers } = simulatePayment({
    providerRequestId: collection.providerRequestId,
    amountCents: collection.amountCents - collection.paidCents,
    reference: collection.reference,
  });
  await handlePaymentWebhook(rawBody, headers, mockProvider);
  redirect("/dashboard");
}

export default async function DevPaymentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { businessId } = await requirePageBusinessUser();
  const collections = await db().collection.findMany({
    where: { businessId, provider: "mock", providerRequestId: { not: null }, status: { not: "PAID" } },
    include: { payer: { select: { parentName: true } } },
    orderBy: { dueDate: "asc" },
  });
  return (
    <main className="content stack narrow">
      <div>
        <h1>Dev payments</h1>
        <p className="muted">
          Mock payment requests that aren&apos;t paid yet. Paying one sends a signed mock webhook, then opens the{" "}
          <Link href="/dashboard">dashboard</Link>.
        </p>
      </div>
      {collections.length === 0 && <p className="panel">No unpaid mock requests. Send one from the dashboard.</p>}
      {collections.map((c) => (
        <form className="panel" key={c.id} action={payInFull}>
          <input type="hidden" name="collectionId" value={c.id} />
          <p className="muted small num">
            {c.reference} · due {c.dueDate.toISOString().slice(0, 10)} · {c.status}
          </p>
          <p>
            {c.payer.parentName}: <span className="num">{formatRand(c.amountCents - c.paidCents)}</span>
          </p>
          <button type="submit">Pay in full</button>
        </form>
      ))}
    </main>
  );
}
