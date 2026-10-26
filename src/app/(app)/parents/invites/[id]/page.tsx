import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/dashboard/action-button";
import { ConfirmAction, InviteShare } from "@/components/invite-actions";
import { answersText, formatWhen, InvitePill, InviteSendNote, optionsText } from "@/components/invite-view";
import { requirePageBusinessUser } from "@/lib/auth";
import { appBaseUrl } from "@/lib/base-url";
import { getBusiness } from "@/lib/business";
import { RHYTHM_LABEL } from "@/lib/dashboard";
import { getInvite, inviteIdSchema, inviteShare, toInviteDto, type InviteState } from "@/lib/invites";
import { formatRand } from "@/lib/money";
import { whatsAppEnabled } from "@/messaging/adapter";
import { smsDate } from "@/messaging/templates/format";

// One invite: the link and message to send while it's open, the parent's answers to approve once they've
// used it. The link's secret is only decrypted here, for someone who can act on it.

const SUBTITLE: Record<InviteState, string> = {
  OPEN: "Waiting for the parent to open the link.",
  EXPIRED: "The parent didn't use the link in time. Make a new invite to try again.",
  AWAITING_APPROVAL: "The parent has added their details. Nothing is sent to them until you approve.",
  APPROVED: "Approved. The parent is on your parents list.",
  DECLINED: "Declined. Thusa won't contact this parent, and their name and number are cleared.",
  CANCELLED: "Cancelled. The link no longer works.",
};

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { businessId, role } = await requirePageBusinessUser();
  const id = inviteIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [business, invite] = await Promise.all([getBusiness(businessId), getInvite(businessId, id.data)]);
  if (!business || !invite) notFound();
  const dto = toInviteDto(invite);
  const canEdit = role !== "READONLY";
  const share = canEdit && dto.state === "OPEN" ? inviteShare(invite, business.name, await appBaseUrl()) : null;
  const { answers } = dto;

  return (
    <div className="stack narrow">
      <section className="panel" aria-labelledby="invite-title">
        <div className="panel-header">
          <div>
            <h2 id="invite-title">Invite for {dto.childName}</h2>
            <p className="subtitle">{SUBTITLE[dto.state]}</p>
          </div>
          <InvitePill state={dto.state} />
        </div>
        <p className="figure num">
          {formatRand(dto.monthlyAmountCents)} <span className="figure-of">a month</span>
        </p>
        <dl className="details">
          {dto.phoneMasked && (
            <div>
              <dt>Parent&apos;s cellphone</dt>
              <dd className="num">{dto.phoneMasked}</dd>
            </div>
          )}
          <div>
            <dt>The parent can pay</dt>
            <dd className="num">{optionsText(dto.options)}</dd>
          </div>
          {(dto.state === "OPEN" || dto.state === "EXPIRED") && (
            <div>
              <dt>{dto.state === "OPEN" ? "Link works until" : "Link expired"}</dt>
              <dd>{smsDate(dto.expiresOn)}</dd>
            </div>
          )}
        </dl>
      </section>

      {share && (
        <section className="panel" aria-labelledby="share-title">
          <div className="panel-header">
            <div>
              <h2 id="share-title">Send the link</h2>
              <p className="subtitle">
                Send this from your phone to the parent{dto.phoneMasked ? ` on ${dto.phoneMasked}` : ""}. The link works once.
              </p>
            </div>
          </div>
          <div className="stack">
            <InviteSendNote link={share.link} whatsAppOn={whatsAppEnabled()} />
            <InviteShare link={share.link} messages={share.messages} defaultLanguage={business.defaultLanguage} />
          </div>
        </section>
      )}

      {answers && dto.state !== "DECLINED" && (
        <section className="panel" aria-labelledby="answers-title">
          <div className="panel-header">
            <div>
              <h2 id="answers-title">{answers.parentName}</h2>
              <p className="subtitle">Parent of {dto.childName}</p>
            </div>
          </div>
          <p className="figure num">
            {formatRand(answers.amountCents)} <span className="figure-of">{RHYTHM_LABEL[answers.rhythm].toLowerCase()}</span>
          </p>
          <dl className="details">
            <div>
              <dt>Pays</dt>
              <dd>{answersText(answers, dto.phoneMasked)}</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>{formatWhen(answers.submittedAt)}</dd>
            </div>
            {dto.consent && (
              <div>
                <dt>Agreed to messages</dt>
                <dd>
                  {formatWhen(dto.consent.consentedAt)}: &ldquo;{dto.consent.text}&rdquo;
                </dd>
              </div>
            )}
          </dl>
          {dto.state === "AWAITING_APPROVAL" && canEdit && (
            <div className="form-actions invite-decision">
              <ActionButton
                url={`/api/invites/${dto.id}/approve`}
                body={{}}
                label="Approve"
                busyLabel="Approving…"
                ariaLabel={`Approve ${answers.parentName}`}
              />
              <ConfirmAction
                url={`/api/invites/${dto.id}/decline`}
                label="Decline"
                question={`Decline ${answers.parentName}? Thusa won't contact them, and their name and number are cleared.`}
                confirmLabel="Yes, decline"
                busyLabel="Declining…"
                keepLabel="Keep"
              />
            </div>
          )}
          {dto.state === "APPROVED" && dto.payerId && (
            <p>
              <Link href={`/parents/${dto.payerId}/edit`}>See {answers.parentName} in your parents list</Link>
            </p>
          )}
        </section>
      )}

      {canEdit && (dto.state === "OPEN" || dto.state === "EXPIRED") && (
        <section className="panel" aria-labelledby="cancel-title">
          <div className="panel-header">
            <div>
              <h2 id="cancel-title">{dto.state === "OPEN" ? "Cancel the link" : "Remove the link"}</h2>
              <p className="subtitle">
                {dto.state === "OPEN" ? "For a link sent to the wrong person. It stops working at once." : "Hides it from your parents page."}
              </p>
            </div>
          </div>
          <ConfirmAction
            url={`/api/invites/${dto.id}/cancel`}
            label={dto.state === "OPEN" ? "Cancel link" : "Remove link"}
            question={`${dto.state === "OPEN" ? "Cancel" : "Remove"} the invite for ${dto.childName}?`}
            confirmLabel={dto.state === "OPEN" ? "Yes, cancel" : "Yes, remove"}
            busyLabel="Saving…"
            keepLabel="Keep"
          />
        </section>
      )}

      <p>
        <Link href="/parents">Back to parents</Link>
      </p>
    </div>
  );
}
