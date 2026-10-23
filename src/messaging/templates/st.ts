import type { TemplateSet } from "./types";

// TODO(translation review): confirm wording with a first-language Sesotho speaker before launch.
export const st: TemplateSet = {
  otp: ({ code, minutes }) =>
    `Khoutu ya hao ya Thusa ke ${code}. E fela ka mor'a metsotso e ${minutes}. O se ke wa e bolella motho. Thusa e ke ke ya o kopa PIN kapa phasewete ya hao.`,
};
