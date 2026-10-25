import { joinNames, proseRand as rand } from "./format";
import type { SentenceSet } from "./types";

// TODO(translation review): confirm wording with a first-language Setswana speaker before launch.

const names = (list: string[], more: number) => joinNames(list, more, "le", (n) => (n === 1 ? "yo mongwe" : `ba bangwe ba le ${n}`));

export const tn: SentenceSet = {
  received: ({ receivedCents, expectedCents }) =>
    `Mo bekeng eno o amogetse ${rand(receivedCents)} go ${rand(expectedCents)} e e neng e solofetswe.`,
  nothingDue: () => "Ga go na tuelo e e neng e tshwanetse go duelwa mo bekeng eno.",
  allPaid: () => "Dituelo tsotlhe tsa beke eno di duetswe.",
  outstanding: ({ outstandingCents }) => `Go sa ntse go emetswe ${rand(outstandingCents)}.`,
  onTime: ({ percent }) => `${percent}% ya dituelo tsa beke eno e duetswe ka nako.`,
  behind: ({ count, cents, weeks }) =>
    count === 1
      ? `Motsadi a le mongwe o sa ntse a na le ${rand(cents)} e a tshwanetseng go e duela go tswa mo dibekeng di le ${weeks} tse di fetileng.`
      : `Batsadi ba le ${count} ba sa ntse ba na le ${rand(cents)} kotlhe e ba tshwanetseng go e duela go tswa mo dibekeng di le ${weeks} tse di fetileng.`,
  reliable: ({ names: list, more }) =>
    list.length === 1 && more === 0
      ? `${list[0]} o duetse ka nako mo makgetlong a le mmalwa a a fetileng.`
      : `${names(list, more)} ba duetse ka nako mo makgetlong a le mmalwa a a fetileng.`,
  offerArrangement: ({ name, behindCents }) =>
    `${name} o sa ntse a na le ${rand(behindCents)} e a tshwanetseng go e duela. O ka dumalana le ${name} ka thulaganyo ya tuelo.`,
  switchToWeekly: ({ name, rhythm }) =>
    `O ka neela ${name} tshono ya go duela beke le beke go na le ${rhythm === "MONTHLY" ? "kgwedi le kgwedi" : "dibeke tse pedi le tse pedi"}. Dituelo tse dinnye di ka nna motlhofo go di duela.`,
  rewardUpfront: ({ count }) =>
    count === 1
      ? "Motsadi a le mongwe o duetse pele ga letsatsi la tuelo. O ka mo leboga."
      : `Batsadi ba le ${count} ba duetse pele ga letsatsi la tuelo. O ka ba leboga.`,
};
