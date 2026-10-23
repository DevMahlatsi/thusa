import type { TemplateSet } from "./types";

export const en: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Your Thusa code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone. Thusa will never ask for your PIN or password.`,
};
