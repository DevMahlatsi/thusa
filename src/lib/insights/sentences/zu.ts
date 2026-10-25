import { proseRand as rand } from "./format";
import type { SentenceSet } from "./types";

// TODO(translation review): confirm wording with a first-language isiZulu speaker before launch.

// Names and amounts take a hyphenated prefix, as in the parent templates: u-Bongani, no-Lindiwe, u-R350.
function names(list: string[], more: number): string {
  const items = list.map((n) => `u-${n}`);
  if (more > 0) return `${items.join(", ")} ${more === 1 ? "nomunye" : `nabanye abangu-${more}`}`;
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} no-${list.at(-1)}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const zu: SentenceSet = {
  received: ({ receivedCents, expectedCents }) =>
    `Kuleli sonto uthole u-${rand(receivedCents)} kwemali engu-${rand(expectedCents)} ebilindelwe.`,
  nothingDue: () => "Ayikho imali ebifanele ikhokhwe kuleli sonto.",
  allPaid: () => "Yonke imali ebifanele ikhokhwe kuleli sonto isikhokhiwe.",
  outstanding: ({ outstandingCents }) => `Kusalindwe u-${rand(outstandingCents)}.`,
  onTime: ({ percent }) => `Ama-${percent}% ezinkokhelo zaleli sonto enziwe ngesikhathi.`,
  behind: ({ count, cents, weeks }) =>
    count === 1
      ? `Kusasele u-${rand(cents)} okufanele ukhokhwe ngumzali oyedwa, wamasonto angu-${weeks} adlule.`
      : `Kusasele u-${rand(cents)} okufanele ukhokhwe ngabazali abangu-${count}, wamasonto angu-${weeks} adlule.`,
  reliable: ({ names: list, more }) =>
    list.length === 1 && more === 0
      ? `U-${list[0]} ukhokhe ngesikhathi izikhathi ezimbalwa ezedlule.`
      : `${capitalise(names(list, more))} bakhokhe ngesikhathi izikhathi ezimbalwa ezedlule.`,
  offerArrangement: ({ name, behindCents }) =>
    `Kusasele u-${rand(behindCents)} okufanele ukhokhwe ngu-${name}. Ungavumelana no-${name} ngohlelo lokukhokha.`,
  switchToWeekly: ({ name, rhythm }) =>
    `Ungase unikeze u-${name} ithuba lokukhokha njalo ngesonto esikhundleni sokukhokha ${rhythm === "MONTHLY" ? "njalo ngenyanga" : "njalo emasontweni amabili"}. Amanani amancane angaba lula ukuwakhokha.`,
  rewardUpfront: ({ count }) =>
    count === 1
      ? "Umzali oyedwa ukhokhe ngaphambi kosuku lokukhokha. Ungambonga."
      : `Abazali abangu-${count} bakhokhe ngaphambi kosuku lokukhokha. Ungababonga.`,
};
