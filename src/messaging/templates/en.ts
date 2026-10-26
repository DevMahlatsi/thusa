import { businessName, childName, smsDate, smsRand } from "./format";
import type { FeeParams, TemplateSet } from "./types";

const SAFETY = "Thusa will never ask for your PIN or password.";

const pay = (p: FeeParams) => (p.link ? `Pay here: ${p.link} Ref ${p.reference}.` : `Pay with reference ${p.reference}.`);

export const en: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Your Thusa code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone. Thusa will never ask for your PIN or password.`,
  payment_request: (p) =>
    `${businessName(p)}: ${childName(p)}'s fees of ${smsRand(p.amountCents)} are due on ${smsDate(p.dueDate)}. ${pay(p)} ${SAFETY}`,
  payment_reminder: (p) =>
    `A friendly reminder from ${businessName(p)}: ${childName(p)}'s fees of ${smsRand(p.amountCents)} were due on ${smsDate(p.dueDate)}. ${pay(p)} If you have paid, thank you. ${SAFETY}`,
  balance_request: (p) =>
    `${businessName(p)}: thank you for paying ${smsRand(p.paidCents)} for ${childName(p)}. The balance is ${smsRand(p.amountCents)}. ${pay(p)} ${SAFETY}`,
  parent_invite: (p) =>
    `${businessName(p)} uses Thusa to collect fees. Add your details for ${childName(p)} and choose when you pay: ${p.link} The link works once, until ${smsDate(p.expiresOn)}. ${SAFETY}`,
};
