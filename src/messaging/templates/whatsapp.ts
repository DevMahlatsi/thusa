import { PAYMENT_PAGE_BASE_URL, paymentPageId } from "@/payments/adapter";
import { businessName, childName, smsDate, smsRand } from "./format";
import type { FeeParams, FeeTemplateKey, Language, PaymentLink } from "./types";

// WhatsApp messages to parents. Outside a chat the parent started, WhatsApp only delivers templates that
// Meta has approved, so the wording lives here once and is submitted to Meta from /dev/whatsapp: what
// Meta approved and what Thusa records on /messages are the same text.
//
// Meta's rules: numbered variables ({{1}}, {{2}}, …) in order, never at the very start or end of the
// body and never side by side; body up to 1024 characters, footer 60, button label 25. The link is a
// "Pay now" button whose base URL Meta approves, so a message only fills in the payment page's id and
// can never carry any other link.
//
// Meta has no Sesotho or Setswana templates. Parents with those languages are messaged by SMS instead.

export const WHATSAPP_LANGUAGES = ["en", "zu"] as const;
export type WhatsAppLanguage = (typeof WHATSAPP_LANGUAGES)[number];

export const isWhatsAppLanguage = (language: Language): language is WhatsAppLanguage =>
  (WHATSAPP_LANGUAGES as readonly string[]).includes(language);

// A new wording needs Meta's approval under a new name, so the version is part of the name.
export const whatsAppTemplateName = (key: FeeTemplateKey) => `thusa_${key}_v1`;

type Field = "business" | "child" | "amount" | "due" | "paid" | "reference";
type Fields = Record<Field, string>;

// Each template's variables, in the order they appear and are numbered.
const FIELDS: Record<FeeTemplateKey, readonly Field[]> = {
  payment_request: ["business", "child", "amount", "due", "reference"],
  payment_reminder: ["business", "child", "amount", "due", "reference"],
  balance_request: ["business", "paid", "child", "amount", "reference"],
};

type Wording = { body: Record<FeeTemplateKey, (f: Fields) => string>; footer: string; button: string };

const WORDING: Record<WhatsAppLanguage, Wording> = {
  en: {
    body: {
      payment_request: (f) =>
        `Hello from ${f.business}. ${f.child}'s fees of ${f.amount} are due on ${f.due}. Your reference is ${f.reference}. Tap Pay now to pay.`,
      payment_reminder: (f) =>
        `A friendly reminder from ${f.business}: ${f.child}'s fees of ${f.amount} were due on ${f.due}. Your reference is ${f.reference}. Tap Pay now to pay. If you have paid, thank you.`,
      balance_request: (f) =>
        `Hello from ${f.business}. Thank you for paying ${f.paid} for ${f.child}. The balance is ${f.amount}. Your reference is ${f.reference}. Tap Pay now to pay the balance.`,
    },
    footer: "Thusa will never ask for your PIN or password.",
    button: "Pay now",
  },
  // TODO(translation review): confirm wording with a first-language isiZulu speaker before launch.
  zu: {
    body: {
      payment_request: (f) =>
        `Umlayezo ovela ku-${f.business}: imali ka-${f.child} engu-${f.amount} ikhokhwa ngo-${f.due}. I-reference yakho ngu-${f.reference}. Cindezela u-Khokha manje ukuze ukhokhe.`,
      payment_reminder: (f) =>
        `Isikhumbuzi esivela ku-${f.business}: imali ka-${f.child} engu-${f.amount} ibikhokhwa ngo-${f.due}. I-reference yakho ngu-${f.reference}. Cindezela u-Khokha manje ukuze ukhokhe. Uma usukhokhile, siyabonga.`,
      balance_request: (f) =>
        `Umlayezo ovela ku-${f.business}: siyabonga ngokukhokha u-${f.paid} ka-${f.child}. Okusele ngu-${f.amount}. I-reference yakho ngu-${f.reference}. Cindezela u-Khokha manje ukuze ukhokhe okusele.`,
    },
    footer: "I-Thusa ayisoze yakucela i-PIN noma iphasiwedi yakho.",
    button: "Khokha manje",
  },
};

/** The body as Meta stores it: each variable as {{n}}. */
export function whatsAppBodyTemplate(language: WhatsAppLanguage, key: FeeTemplateKey): string {
  const numbered = Object.fromEntries(FIELDS[key].map((field, i) => [field, `{{${i + 1}}}`])) as Fields;
  return WORDING[language].body[key](numbered);
}

// What a fee template is filled in with. paidCents is only used by balance_request.
type WhatsAppParams = FeeParams & { paidCents?: number };

function fieldValues(p: WhatsAppParams): Fields {
  return {
    business: businessName(p),
    child: childName(p),
    amount: smsRand(p.amountCents),
    due: smsDate(p.dueDate),
    paid: smsRand(p.paidCents ?? 0),
    reference: p.reference,
  };
}

/** One template message, ready for the Cloud API, and its text as the parent sees it. */
export type WhatsAppTemplateMessage = {
  name: string;
  language: WhatsAppLanguage;
  // The body's variables, in order.
  bodyParameters: string[];
  // The payment page id the "Pay now" button adds to its approved base URL.
  buttonParameter: string;
  // As the parent sees it, in its parts (for the demo's preview) and as one text (what /messages records).
  parts: { body: string; footer: string; button: string; url: string };
  text: string;
};

/**
 * The WhatsApp message for a fee, or null when WhatsApp can't carry it: no template in this language, or
 * no payment page link (the button needs one).
 */
export function renderWhatsApp(language: Language, key: FeeTemplateKey, params: WhatsAppParams): WhatsAppTemplateMessage | null {
  if (!isWhatsAppLanguage(language) || !params.link) return null;
  const pageId = paymentPageId(params.link);
  if (!pageId) return null;
  const values = fieldValues(params);
  const wording = WORDING[language];
  const parts = { body: wording.body[key](values), footer: wording.footer, button: wording.button, url: `${PAYMENT_PAGE_BASE_URL}${pageId}` };
  return {
    name: whatsAppTemplateName(key),
    language,
    bodyParameters: FIELDS[key].map((field) => values[field]),
    buttonParameter: pageId,
    parts,
    text: `${parts.body}\n\n${parts.footer}\n\n[${parts.button}] ${parts.url}`,
  };
}

// ---- Submitting to Meta -----------------------------------------------------------------------------

const EXAMPLE_LINK = `${PAYMENT_PAGE_BASE_URL}uoJKLysCwhRAHNWAQR4SFa` as PaymentLink;
const EXAMPLE: WhatsAppParams = {
  business: "Kopano Crèche",
  child: "Lerato",
  amountCents: 125_000,
  paidCents: 60_000,
  dueDate: "2026-10-30",
  reference: "THK7Q2M9XA",
  link: EXAMPLE_LINK,
};

/** The body for POST /{business account id}/message_templates: one template in one language. */
export type WhatsAppTemplateDefinition = {
  name: string;
  language: WhatsAppLanguage;
  category: "UTILITY";
  components: [
    { type: "BODY"; text: string; example: { body_text: string[][] } },
    { type: "FOOTER"; text: string },
    { type: "BUTTONS"; buttons: [{ type: "URL"; text: string; url: string; example: string[] }] },
  ];
};

/** The template filled in with the made-up example Meta reviews, for a test send from /dev/whatsapp. */
export const exampleWhatsAppMessage = (language: WhatsAppLanguage, key: FeeTemplateKey) => renderWhatsApp(language, key, EXAMPLE)!;

export function whatsAppTemplateDefinition(language: WhatsAppLanguage, key: FeeTemplateKey): WhatsAppTemplateDefinition {
  const example = exampleWhatsAppMessage(language, key);
  const wording = WORDING[language];
  return {
    name: whatsAppTemplateName(key),
    language,
    category: "UTILITY",
    components: [
      { type: "BODY", text: whatsAppBodyTemplate(language, key), example: { body_text: [example.bodyParameters] } },
      { type: "FOOTER", text: wording.footer },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: wording.button, url: `${PAYMENT_PAGE_BASE_URL}{{1}}`, example: [EXAMPLE_LINK] },
        ],
      },
    ],
  };
}

export const WHATSAPP_TEMPLATE_KEYS: readonly FeeTemplateKey[] = ["payment_request", "payment_reminder", "balance_request"];

/** Every template Thusa needs approved: each fee template in each WhatsApp language. */
export function allWhatsAppTemplateDefinitions(): WhatsAppTemplateDefinition[] {
  return WHATSAPP_LANGUAGES.flatMap((language) => WHATSAPP_TEMPLATE_KEYS.map((key) => whatsAppTemplateDefinition(language, key)));
}
