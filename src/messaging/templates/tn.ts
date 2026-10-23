import type { TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language Setswana speaker before launch.
export const tn: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Khoutu ya gago ya Thusa ke ${code}. E fela morago ga metsotso e ${minutes}. O se ka wa e bolelela ope. Thusa ga e kitla e go kopa PIN kgotsa phasewete ya gago.`,
};
