import type { InviteDto, InviteState } from "@/lib/invites";
import { InfoIcon } from "./icons";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import { RHYTHM_LABEL } from "@/lib/dashboard";
import { formatRand } from "@/lib/money";
import { formatPayday } from "@/lib/schedule-format";

// Shared by the parents page and an invite's own page. Server-safe: no client hooks.

const STATE: Record<InviteState, { label: string; className: string }> = {
  OPEN: { label: "Link sent", className: "pill pending" },
  EXPIRED: { label: "Expired", className: "pill pending" },
  // The one that needs the owner: the lime key tag.
  AWAITING_APPROVAL: { label: "Awaiting approval", className: "tag" },
  APPROVED: { label: "Approved", className: "pill paid" },
  DECLINED: { label: "Declined", className: "pill pending" },
  CANCELLED: { label: "Cancelled", className: "pill pending" },
};

/**
 * Above the message to send: why the owner sends it themselves (Thusa doesn't send invites while WhatsApp is
 * off), and the parent's own page to look at. That page is the real one, so the owner is told that filling it
 * in counts as the parent's answers (handy for trying it out, and for judges playing the parent).
 */
export function InviteSendNote({ link, whatsAppOn }: { link: string; whatsAppOn: boolean }) {
  return (
    <div className="stack-tight">
      {!whatsAppOn && (
        <div className="sample-banner" role="note">
          <InfoIcon size={18} />
          <p>
            With the WhatsApp Business API switched on, Thusa would send this link to the parent for you. It isn&apos;t
            switched on yet, so send it from your phone below, or see what the parent would see.
          </p>
        </div>
      )}
      <div className="invite-preview">
        <a className="button secondary" href={link} target="_blank" rel="noopener">
          See what the parent sees<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <span className="muted small">Opens the parent&apos;s page. If you fill it in there, it counts as their answers.</span>
      </div>
    </div>
  );
}

// Text label plus colour, never colour alone.
export function InvitePill({ state }: { state: InviteState }) {
  return <span className={STATE[state].className}>{STATE[state].label}</span>;
}

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  });

/** "R 1 200.00 monthly, R 553.85 fortnightly or R 276.92 weekly" */
export function optionsText(options: InviteDto["options"]): string {
  const parts = options.map((o) => `${formatRand(o.amountCents)} ${RHYTHM_LABEL[o.rhythm].toLowerCase()}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts.join("");
}

type Answers = NonNullable<InviteDto["answers"]>;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Weekly, every Friday · ••••4567 · isiZulu" */
export const answersText = (a: Answers, phoneMasked: string | null) =>
  [`${RHYTHM_LABEL[a.rhythm]}, ${lowerFirst(formatPayday(a.rhythm, a.payday))}`, phoneMasked, LANGUAGE_NAMES[a.language]]
    .filter(Boolean)
    .join(" · ");
