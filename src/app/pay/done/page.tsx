import { AuthFrame } from "@/components/auth-frame";

// Where the payment provider sends a payer after its payment page. Public and read-only: it never marks
// anything paid. Only a verified provider event does that, so the wording stays "being confirmed".

const MESSAGES = {
  complete: {
    title: "Thank you",
    body: "Your payment is being confirmed with your bank. You can close this page.",
  },
  closed: {
    title: "Payment not finished",
    body: "No payment was made. Open the same link again whenever you're ready to pay.",
  },
  failed: {
    title: "Payment didn't go through",
    body: "Your bank didn't complete the payment. You can try again from the same link.",
  },
} as const;

// The providers' words for each outcome. Express's exact values for payment links aren't documented, so
// anything else gets the neutral fallback.
const STATUS_WORDS: Record<string, keyof typeof MESSAGES> = {
  complete: "complete",
  paid: "complete",
  success: "complete",
  closed: "closed",
  cancelled: "closed",
  abandoned: "closed",
  failed: "failed",
  failure: "failed",
};

const FALLBACK = { title: "Payment", body: "If you paid, it's being confirmed with your bank. You can close this page." };

export default async function PaymentDonePage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { status } = await searchParams;
  const word = typeof status === "string" ? status.toLowerCase() : "";
  const message = Object.hasOwn(STATUS_WORDS, word) ? MESSAGES[STATUS_WORDS[word]!] : FALLBACK;
  return (
    <AuthFrame>
      <div className="stack">
        <h1>{message.title}</h1>
        <p className="muted">{message.body}</p>
      </div>
    </AuthFrame>
  );
}
