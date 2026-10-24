// SMS text rules. Phones fit 160 GSM-7 characters in one SMS (153 per part when split), but a single
// character outside that alphabet switches the whole message to UCS-2: 70 per SMS, 67 per part, so a
// message costs two or three times as much. Names can hold any letter, so every SMS is folded into the
// GSM alphabet before it is sent and the folded text is what gets stored.

// Clickatell setup "message parts" is 3. A message needing more is refused before it reaches them.
export const MAX_SMS_PARTS = 3;

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Each of these takes two characters' room (an escape plus the character).
const GSM_EXTENDED = "^{}\\[~]|€";

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

const isGsm = (ch: string) => BASIC.has(ch) || EXTENDED.has(ch);

const LOOKALIKES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
  " ": " ",
  "…": "...",
};

/** Folds text into the GSM alphabet: curly quotes to straight, accents dropped (ê -> e), anything else "?". */
export function toGsm(text: string): string {
  let out = "";
  for (const ch of text) {
    if (isGsm(ch)) out += ch;
    else if (LOOKALIKES[ch]) out += LOOKALIKES[ch];
    else {
      const plain = ch.normalize("NFD").replace(/\p{M}/gu, "");
      out += plain && [...plain].every(isGsm) ? plain : "?";
    }
  }
  return out;
}

/** How many SMS parts the text needs. */
export function smsParts(text: string): number {
  const chars = [...text];
  if (chars.every(isGsm)) {
    const length = chars.reduce((n, ch) => n + (EXTENDED.has(ch) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  // UCS-2 counts UTF-16 code units.
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}
