import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth-frame";
import { JoinForm } from "@/components/join-form";
import { closedMessage, consentText, findInviteForJoin } from "@/lib/invites";
import { formatRand } from "@/lib/money";
import { smsDate } from "@/messaging/templates/format";

// Public: where a parent's invite link lands. No login. The link's secret finds the invite; the page shows
// only the crèche's name, the child, the fee and the last digits of the number, never anyone's answers.
// Amounts are worked out on the server; the form can't send one, or a phone number.

export const metadata: Metadata = { title: "Join | Thusa", robots: { index: false, follow: false } };

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <AuthFrame>
      <div className="stack">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
      </div>
    </AuthFrame>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInviteForJoin(token);
  if (!invite) return <Closed title="Link not valid" body="This link isn't valid. Ask the crèche to send you a new one." />;
  if (invite.state !== "OPEN") {
    return <Closed title="Link can't be used" body={closedMessage(invite.state, invite.businessName)} />;
  }

  return (
    <AuthFrame wide>
      <div className="stack">
        <div>
          <p className="muted small">Invitation from</p>
          <h1>{invite.businessName}</h1>
          <p className="muted">
            Add your details to pay {invite.childName}&apos;s fees with Thusa. The fee is{" "}
            <strong className="num">{formatRand(invite.monthlyAmountCents)}</strong> a month. You choose when you pay. This link
            works once, until {smsDate(invite.expiresOn)}.
          </p>
        </div>
        <JoinForm
          token={token}
          businessName={invite.businessName}
          phoneMasked={invite.phoneMasked}
          options={invite.options}
          defaultLanguage={invite.defaultLanguage}
          consentText={consentText(invite.businessName)}
        />
      </div>
    </AuthFrame>
  );
}
