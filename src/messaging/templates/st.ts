import { businessName, childName, smsDate, smsRand } from "./format";
import type { FeeParams, TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language Sesotho speaker before launch.

const SAFETY = "Thusa e ke ke ya o kopa PIN kapa phasewete ya hao.";

const pay = (p: FeeParams) => (p.link ? `Lefa mona: ${p.link} Ref ${p.reference}.` : `Lefa ka reference ${p.reference}.`);

export const st: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Khoutu ya hao ya Thusa ke ${code}. E fela ka mor'a metsotso e ${minutes}. O se ke wa e bolella motho. Thusa e ke ke ya o kopa PIN kapa phasewete ya hao.`,
  payment_request: (p) =>
    `${businessName(p)}: Tefo ya ${childName(p)} ya ${smsRand(p.amountCents)} e lokela ho lefuwa ka ${smsDate(p.dueDate)}. ${pay(p)} ${SAFETY}`,
  payment_reminder: (p) =>
    `Kgopotso e tswang ho ${businessName(p)}: tefo ya ${childName(p)} ya ${smsRand(p.amountCents)} e ne e lokela ka ${smsDate(p.dueDate)}. ${pay(p)} Haeba o se o lefile, re a leboha. ${SAFETY}`,
  balance_request: (p) =>
    `${businessName(p)}: re a leboha ka tefo ya ${smsRand(p.paidCents)} bakeng sa ${childName(p)}. Se setseng ke ${smsRand(p.amountCents)}. ${pay(p)} ${SAFETY}`,
};
