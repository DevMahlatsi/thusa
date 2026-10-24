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
// for Stitch. "Pay half" leaves a collection PARTIAL, so the balance request flow can be tried; a
// balance request's link is then paid here too.

const formSchema = z.object({ id: z.uuid(), share: z.enum(["full", "half"]) });

async function pay(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") notFound();
  const { businessId, role } = await requirePageBusinessUser();
  if (role === "READONLY") redirect("/dev/payments");
  const form = formSchema.safeParse({ id: formData.get("id"), share: formData.get("share") });
  if (!form.success) notFound();

  // The id is a collection, or a balance request on one; both must be this business's mock requests.
  const balance = await db().balanceRequest.findFirst({
    where: { id: form.data.id, businessId, provider: "mock", providerRequestId: { not: null } },
  });
  const collection = balance
    ? null
    : await db().collection.findFirst({
        where: { id: form.data.id, businessId, provider: "mock", providerRequestId: { not: null } },
      });
  const target = balance ?? collection;
  if (!target?.providerRequestId) notFound();

  const owed = balance ? balance.amountCents : collection!.amountCents - collection!.paidCents;
  const { rawBody, headers } = simulatePayment({
    providerRequestId: target.providerRequestId,
    amountCents: form.data.share === "half" ? Math.floor(owed / 2) : owed,
    reference: target.reference,
  });
  await handlePaymentWebhook(rawBody, headers, mockProvider);
  redirect("/dashboard");
}

export default async function DevPaymentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { businessId } = await requirePageBusinessUser();
  // A PARTIAL collection's own link has been paid; what's left is paid on its balance request.
  const [collections, balances] = await Promise.all([
    db().collection.findMany({
      where: { businessId, provider: "mock", providerRequestId: { not: null }, status: "PENDING" },
      include: { payer: { select: { parentName: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db().balanceRequest.findMany({
      where: { businessId, provider: "mock", providerRequestId: { not: null }, collection: { status: "PARTIAL" } },
      include: { collection: { select: { paidCents: true, dueDate: true, payer: { select: { parentName: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Only the balance request for what's owed now; older ones were for an earlier amount.
  const openBalances = balances.filter((b) => b.forPaidCents === b.collection.paidCents);

  return (
    <main className="content stack narrow">
      <div>
        <h1>Dev payments</h1>
        <p className="muted">
          Mock payment requests that aren&apos;t paid yet. Paying one sends a signed mock webhook, then opens the{" "}
          <Link href="/dashboard">dashboard</Link>.
        </p>
      </div>
      {collections.length + openBalances.length === 0 && (
        <p className="panel">No unpaid mock requests. Send one (or request a balance) from the dashboard.</p>
      )}
      {collections.map((c) => (
        <form className="panel stack-tight" key={c.id} action={pay}>
          <input type="hidden" name="id" value={c.id} />
          <p className="muted small num">
            {c.reference} · due {c.dueDate.toISOString().slice(0, 10)} · {c.status}
          </p>
          <p>
            {c.payer.parentName}: <span className="num">{formatRand(c.amountCents - c.paidCents)}</span>
          </p>
          <div className="row-actions">
            <button type="submit" name="share" value="full">
              Pay in full
            </button>
            <button type="submit" name="share" value="half" className="secondary">
              Pay half
            </button>
          </div>
        </form>
      ))}
      {openBalances.map((b) => (
        <form className="panel stack-tight" key={b.id} action={pay}>
          <input type="hidden" name="id" value={b.id} />
          <p className="muted small num">
            Balance {b.reference} · due {b.collection.dueDate.toISOString().slice(0, 10)} · PARTIAL
          </p>
          <p>
            {b.collection.payer.parentName}: <span className="num">{formatRand(b.amountCents)}</span> still owed
          </p>
          <div className="row-actions">
            <button type="submit" name="share" value="full">
              Pay balance
            </button>
          </div>
        </form>
      ))}
    </main>
  );
}
