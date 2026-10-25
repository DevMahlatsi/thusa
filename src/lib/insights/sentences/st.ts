import { joinNames, proseRand as rand } from "./format";
import type { SentenceSet } from "./types";

// TODO(translation review): confirm wording with a first-language Sesotho speaker before launch.

const names = (list: string[], more: number) => joinNames(list, more, "le", (n) => (n === 1 ? "e mong" : `ba bang ba ${n}`));

export const st: SentenceSet = {
  received: ({ receivedCents, expectedCents }) =>
    `Bekeng ena o amohetse ${rand(receivedCents)} ho ${rand(expectedCents)} e neng e lebeletswe.`,
  nothingDue: () => "Ha ho tefo e neng e lokela ho lefuwa bekeng ena.",
  allPaid: () => "Ditefo tsohle tsa beke ena di lefilwe.",
  outstanding: ({ outstandingCents }) => `Ho sa ntse ho emetswe ${rand(outstandingCents)}.`,
  onTime: ({ percent }) => `${percent}% ya ditefo tsa beke ena e lefilwe ka nako.`,
  behind: ({ count, cents, weeks }) =>
    count === 1
      ? `Motswadi a le mong o sa na le ${rand(cents)} eo a lokelang ho e lefa ho tswa dibekeng tse ${weeks} tse fetileng.`
      : `Batswadi ba ${count} ba sa na le ${rand(cents)} kaofela eo ba lokelang ho e lefa ho tswa dibekeng tse ${weeks} tse fetileng.`,
  reliable: ({ names: list, more }) =>
    list.length === 1 && more === 0
      ? `${list[0]} o lefile ka nako dinakong tse mmalwa tse fetileng.`
      : `${names(list, more)} ba lefile ka nako dinakong tse mmalwa tse fetileng.`,
  offerArrangement: ({ name, behindCents }) =>
    `${name} o sa na le ${rand(behindCents)} eo a lokelang ho e lefa. O ka lumellana le ${name} ka moralo wa tefo.`,
  switchToWeekly: ({ name, rhythm }) =>
    `O ka fa ${name} monyetla wa ho lefa beke le beke ho e na le ${rhythm === "MONTHLY" ? "kgwedi le kgwedi" : "dibeke tse pedi le tse pedi"}. Ditefo tse nyane di ka ba bonolo ho di lefa.`,
  rewardUpfront: ({ count }) =>
    count === 1
      ? "Motswadi a le mong o lefile pele ho letsatsi la tefo. O ka mo leboha."
      : `Batswadi ba ${count} ba lefile pele ho letsatsi la tefo. O ka ba leboha.`,
};
