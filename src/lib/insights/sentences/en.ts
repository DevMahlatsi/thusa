import { joinNames, proseRand as rand } from "./format";
import type { SentenceSet } from "./types";

const names = (list: string[], more: number) => joinNames(list, more, "and", (n) => `${n} ${n === 1 ? "other" : "others"}`);

export const en: SentenceSet = {
  received: ({ receivedCents, expectedCents }) => `This week you received ${rand(receivedCents)} of the ${rand(expectedCents)} due.`,
  nothingDue: () => "No fees were due this week.",
  allPaid: () => "Everything due this week has been paid.",
  outstanding: ({ outstandingCents }) => `${rand(outstandingCents)} is still outstanding.`,
  onTime: ({ percent }) => `${percent}% of this week's fees were paid on time.`,
  behind: ({ count, cents, weeks }) =>
    count === 1
      ? `1 parent still has ${rand(cents)} to pay from the last ${weeks} weeks.`
      : `${count} parents still have ${rand(cents)} to pay between them from the last ${weeks} weeks.`,
  reliable: ({ names: list, more }) =>
    list.length === 1 && more === 0
      ? `${list[0]} has paid the last few fees on time.`
      : `${names(list, more)} have paid their last few fees on time.`,
  offerArrangement: ({ name, behindCents }) =>
    `${name} has ${rand(behindCents)} still to pay. You could agree a payment plan with ${name}.`,
  switchToWeekly: ({ name, rhythm }) =>
    `You could offer ${name} weekly payments instead of ${rhythm === "MONTHLY" ? "monthly" : "fortnightly"} ones: smaller amounts can be easier to keep up with.`,
  rewardUpfront: ({ count }) =>
    count === 1
      ? "1 parent paid a fee before it was due. You could thank them."
      : `${count} parents paid a fee before it was due. You could thank them.`,
};
