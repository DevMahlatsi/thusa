import { businessName, childName, smsDate, smsRand } from "./format";
import type { FeeParams, TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language isiZulu speaker before launch.

const SAFETY = "I-Thusa ayisoze yakucela i-PIN noma iphasiwedi yakho.";

const pay = (p: FeeParams) =>
  p.link ? `Khokha lapha: ${p.link} Ref ${p.reference}.` : `Khokha usebenzisa i-reference ${p.reference}.`;

export const zu: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Ikhodi yakho ye-Thusa ngu-${code}. Iphelelwa yisikhathi emizuzwini engu-${minutes}. Ungayitsheli muntu. I-Thusa ayisoze yakucela i-PIN noma iphasiwedi yakho.`,
  payment_request: (p) =>
    `${businessName(p)}: Imali ka-${childName(p)} engu-${smsRand(p.amountCents)} ikhokhwa ngo-${smsDate(p.dueDate)}. ${pay(p)} ${SAFETY}`,
  payment_reminder: (p) =>
    `Isikhumbuzi esivela ku-${businessName(p)}: imali ka-${childName(p)} engu-${smsRand(p.amountCents)} ibikhokhwa ngo-${smsDate(p.dueDate)}. ${pay(p)} Uma usukhokhile, siyabonga. ${SAFETY}`,
  balance_request: (p) =>
    `${businessName(p)}: siyabonga ngokukhokha u-${smsRand(p.paidCents)} ka-${childName(p)}. Okusele ngu-${smsRand(p.amountCents)}. ${pay(p)} ${SAFETY}`,
  parent_invite: (p) =>
    `${businessName(p)} isebenzisa i-Thusa ukuqoqa imali. Faka imininingwane ka-${childName(p)}, ukhethe ukuthi uzokhokha nini: ${p.link} Isixhumanisi sisebenza kanye, kuze kube ngu-${smsDate(p.expiresOn)}. ${SAFETY}`,
};
