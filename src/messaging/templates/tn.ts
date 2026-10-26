import { businessName, childName, smsDate, smsRand } from "./format";
import type { FeeParams, TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language Setswana speaker before launch.

const SAFETY = "Thusa ga e kitla e go kopa PIN kgotsa phasewete ya gago.";

const pay = (p: FeeParams) => (p.link ? `Duela fano: ${p.link} Ref ${p.reference}.` : `Duela ka reference ${p.reference}.`);

export const tn: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Khoutu ya gago ya Thusa ke ${code}. E fela morago ga metsotso e ${minutes}. O se ka wa e bolelela ope. Thusa ga e kitla e go kopa PIN kgotsa phasewete ya gago.`,
  payment_request: (p) =>
    `${businessName(p)}: Tuelo ya ga ${childName(p)} ya ${smsRand(p.amountCents)} e tshwanetse go duelwa ka ${smsDate(p.dueDate)}. ${pay(p)} ${SAFETY}`,
  payment_reminder: (p) =>
    `Kgopotso go tswa go ${businessName(p)}: tuelo ya ga ${childName(p)} ya ${smsRand(p.amountCents)} e ne e tshwanetse ka ${smsDate(p.dueDate)}. ${pay(p)} Fa o setse o duetse, re a leboga. ${SAFETY}`,
  balance_request: (p) =>
    `${businessName(p)}: re a leboga ka tuelo ya ${smsRand(p.paidCents)} ya ga ${childName(p)}. Se se setseng ke ${smsRand(p.amountCents)}. ${pay(p)} ${SAFETY}`,
  parent_invite: (p) =>
    `${businessName(p)} e dirisa Thusa go kokoanya dituelo. Tsenya dintlha tsa ga ${childName(p)} mme o tlhophe gore o duela leng: ${p.link} Kgolagano e dira gangwe fela, go fitlha ka ${smsDate(p.expiresOn)}. ${SAFETY}`,
};
