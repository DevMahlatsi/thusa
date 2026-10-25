import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InfoIcon } from "@/components/icons";
import { WhatsAppSampleForm } from "@/components/whatsapp-sample-form";
import { requirePageBusinessUser } from "@/lib/auth";
import { formatRand } from "@/lib/money";
import { getWhatsAppSample } from "@/lib/whatsapp-sample";

export const dynamic = "force-dynamic";

const formatDue = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", timeZone: "UTC" });

// Demo account only: what a parent gets on WhatsApp for one fee. Until WhatsApp is switched on it's a
// preview (nothing is sent; the Pay now link is the real test payment page). Once it's on, a judge can
// also send it to their own WhatsApp. Anywhere else this page doesn't exist.
export default async function WhatsAppSamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { businessId, role } = await requirePageBusinessUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success || role === "READONLY") notFound();
  const sample = await getWhatsAppSample(businessId, id.data);
  if (!sample) notFound();
  const message = sample.message;

  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="sample-title">
        <div className="panel-header">
          <div>
            <h2 id="sample-title">{sample.canSend ? "Send to my WhatsApp" : "WhatsApp preview"}</h2>
            <p className="subtitle">What {sample.parentName} gets on WhatsApp</p>
          </div>
        </div>
        <div className="stack">
          {!sample.canSend && (
            <div className="sample-banner" role="note">
              <InfoIcon size={18} />
              <p>
                <strong>WhatsApp sending isn&apos;t switched on yet.</strong> Before any app can message parents on
                WhatsApp, Meta has to approve each message template and the number it comes from. That takes longer
                than the hackathon allowed, so for now Thusa shows exactly what the parent will get. Nothing is sent.
                The Pay now button is the real test payment page (no real money).
              </p>
            </div>
          )}
          <p className="small num">
            {sample.childName}&apos;s fees · {formatRand(sample.amountCents)} · due {formatDue(sample.dueDate)} · Ref{" "}
            {sample.reference}
          </p>
          {message ? (
            <>
              <figure className="wa-preview" aria-label="The WhatsApp message">
                <p>{message.parts.body}</p>
                <p className="muted small">{message.parts.footer}</p>
                <a className="wa-button" href={message.parts.url} target="_blank" rel="noopener noreferrer">
                  {message.parts.button}
                </a>
              </figure>
              {sample.canSend ? (
                <WhatsAppSampleForm collectionId={id.data} />
              ) : (
                <p className="muted small">
                  Paid it? Go back to the <Link href="/dashboard">dashboard</Link>: the fee turns Paid once Stitch confirms
                  the payment.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="message problem" role="alert">
                {sample.problem}
              </p>
              <div className="form-actions">
                <Link href="/dashboard" className="button secondary">
                  Back to the dashboard
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
