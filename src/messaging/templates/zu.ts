import type { TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language isiZulu speaker before launch.
export const zu: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Ikhodi yakho ye-Thusa ngu-${code}. Iphelelwa yisikhathi emizuzwini engu-${minutes}. Ungayitsheli muntu. I-Thusa ayisoze yakucela i-PIN noma iphasiwedi yakho.`,
};
