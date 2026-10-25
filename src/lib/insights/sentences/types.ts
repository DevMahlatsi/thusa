// The fixed sentences of "This week in plain words", one set per language. Written for the owner (never
// sent to parents). No gendered pronouns: we don't know a parent's gender, so the name is repeated.

export type SentenceSet = {
  received: (p: { receivedCents: number; expectedCents: number }) => string;
  nothingDue: () => string;
  allPaid: () => string;
  outstanding: (p: { outstandingCents: number }) => string;
  onTime: (p: { percent: number }) => string;
  // count parents together owe `cents` from fees due in the last `weeks` weeks.
  behind: (p: { count: number; cents: number; weeks: number }) => string;
  // names: up to three RELIABLE parents; more: how many others there are.
  reliable: (p: { names: string[]; more: number }) => string;
  offerArrangement: (p: { name: string; behindCents: number }) => string;
  switchToWeekly: (p: { name: string; rhythm: "MONTHLY" | "FORTNIGHTLY" }) => string;
  rewardUpfront: (p: { count: number }) => string;
};
