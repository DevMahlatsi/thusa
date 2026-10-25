# AI: "This week in plain words"

Read this before touching anything that calls the OpenAI API.

## What it is

A short weekly money summary on the Overview page, written for the **owner only**, in their chosen
language (English, isiZulu, Sesotho, Setswana). It explains the numbers and insights Thusa has
already calculated. It does not calculate anything itself.

Example output (a headline line, then a short note; under 60 words, at most 3 numbers):
> Half of this week's fees are in.
> R1 450 of what's outstanding is only due today. Palesa has fallen behind on recent fees, and
> Bongani has paid on time every week. You could agree a payment plan with Palesa.

It sits next to the KPI tiles and under the week's dates, so it says what the numbers mean instead of
repeating them.

## Golden rules (non-negotiable)

1. **Code calculates, AI explains.** Totals, reliability badges and suggestions come from
   `src/lib/insights/` (deterministic, tested). The AI only rewrites them as plain language.
2. **AI never acts.** It cannot send messages, create or change collections, change schedules,
   or touch money. Its output is display text only.
3. **AI never writes to parents.** Parent messages stay on the fixed templates in
   `src/messaging/templates/`. AI output must never be sent by SMS or WhatsApp.
4. **Minimum data out.** Only send what's listed under "Allowed input". Never send phone numbers,
   bank details, payment references, ID numbers, surnames, child names or the business's address.
5. **Never trust the output with numbers.** Every rand figure shown must come from our data. If the
   AI text contains an amount that isn't in the input, discard it and use the fallback.
6. **The demo must never break because of AI.** Any error, timeout or missing key falls back to the
   rule-based insights, with no error shown to the user.

## Configuration

- `OPENAI_API_KEY`: server-side only. Never expose to the browser or `NEXT_PUBLIC_*`.
- `OPENAI_MODEL`: `gpt-5.6-luna` (OpenAI's lowest cost and latency reasoning model).
- `OPENAI_REASONING_EFFORT`: default `low`. Always pass it explicitly; Luna defaults to `medium`
  if omitted. Optionally use `medium` for zu/st/tn if translation quality needs it.
- Use the **Responses API** (`POST https://api.openai.com/v1/responses`, `reasoning: { effort }`), not
  Chat Completions. Plain `fetch`, no SDK (like the Stitch, Clickatell and WhatsApp clients). The REST
  answer has no `output_text` field (that's an SDK helper): join the `output_text` parts of its
  `message` items.
- Set `max_output_tokens: 1500`. Reasoning tokens count towards this limit; too low returns
  `status: "incomplete"` with no text. Treat `incomplete` as a failure and use the fallback.
- `AI_SUMMARY_ENABLED`: `true` | `false`. Default `false` if unset.
- Add all four to `.env.example`. Leave `OPENAI_API_KEY` empty there, so secret scanners stay quiet.
- A monthly spend limit is set in the OpenAI dashboard (outside the code).

## Where the code lives

- `src/lib/insights/`: the numbers, badges, suggestions and fallback sentences. No AI.
- `src/ai/client.ts`: the only file that calls the OpenAI API. Timeout 8 s, no retries.
- `src/ai/summary.ts`: builds the input, calls the client, validates the output, handles fallback.
- `src/ai/prompt.ts`: system prompt and language instructions.
- Nothing outside `src/ai/` calls OpenAI.

## Insights (`src/lib/insights/`)

Pure functions, worked out on the server for the logged-in `businessId`. They feed both the AI and
the fallback.

- **Period:** the last 7 days up to and including today, SA time (e.g. "19–25 Oct 2026"). It crosses
  month ends, so load this month's and last month's rows.
- **Totals and on-time rate:** the dashboard's own maths (`computeKpis`) over fees due in the period,
  including due dates with no request sent yet.
- **Per parent:** only fees that were sent, due in the last 35 days, before today (a fee that was
  never sent is not the parent's fault). `behindCents` = amount − paid over those fees.
- **Badge** (first match wins):
  1. `NEEDS_SUPPORT`: 2 or more past-due fees not fully paid, or one unpaid 7+ days after its due date
  2. `NEW`: fewer than 3 sent fees due so far
  3. `RELIABLE`: the last 4 fees (3 if that's all there is) were all paid on time
  4. `ON_TRACK`: everyone else
- **Suggestions** (options for the owner, at most one per parent):
  - `OFFER_ARRANGEMENT`: behind by more than one whole fee
  - otherwise `SWITCH_TO_WEEKLY`: `NEEDS_SUPPORT` on a MONTHLY or FORTNIGHTLY schedule
  - plus one `REWARD_UPFRONT` with the count of parents who paid a fee before its due date, worded as
    "you could thank them". Never a discount or a price change.
- **First name:** the first word of `parentName`, skipping titles (Mr, Mrs, Ms, Dr, Mme, Gogo).
- **Fallback sentences:** fixed templates in en, zu, st and tn. No gendered pronouns: we don't know
  a parent's gender, so repeat the name.

## Allowed input (build on the server, scoped to the logged-in `businessId`)

```json
{
  "language": "zu",
  "currency": "ZAR",
  "totals": { "expectedCents": 510000, "receivedCents": 420000, "outstandingCents": 90000 },
  "receivedShare": 0.82,
  "outstanding": { "dueTodayCents": 55000, "notSentCents": 0, "lateCents": 35000 },
  "onTimeRate": 0.82,
  "behind": { "parents": 3, "cents": 175000 },
  "parents": [
    { "firstName": "Bongani", "rhythm": "WEEKLY", "badge": "RELIABLE", "behindCents": 0 },
    { "firstName": "Palesa", "rhythm": "FORTNIGHTLY", "badge": "NEEDS_SUPPORT", "behindCents": 70000 }
  ],
  "suggestions": [
    { "type": "SWITCH_TO_WEEKLY", "firstName": "Palesa" },
    { "type": "REWARD_UPFRONT", "count": 6 },
    { "type": "OFFER_ARRANGEMENT", "firstName": "Thandi" }
  ]
}
```

Limit to the 10 most relevant parents to keep requests small. Everything here is worked out by code, so
the AI never has to add, subtract or compare:
- No dates: the panel already shows the week, and the AI must not repeat it.
- `totals`, `outstanding` and `onTimeRate` are this week's fees. `receivedShare` is received ÷ expected
  (two decimals; null when nothing was due), for the headline in words.
- `outstanding` splits this week's outstanding money: due today (not late yet), never sent, and late.
- `behind` covers every parent (not just the 10) and the last 5 weeks of sent fees due before today. It
  differs from this week's outstanding: it leaves out fees due today and fees never sent, and includes
  earlier weeks. `outstanding` is what lets the AI explain the difference ("R1 450 of it is only due today").

## Prompt rules (for `prompt.ts`)

- Line 1: a one-line headline in words that sums up the week, from `receivedShare` ("Half of this
  week's fees are in."). No date and no digits in the headline.
- Then, on the next line, 2 or 3 short sentences. Under 60 words in all, headline included.
- Don't repeat the period or the totals already shown on the page; say what they mean.
- At most 3 numbers in all, each exactly as given. Format rand as `R4 200`. Do not invent figures,
  names or trends, and don't add up, subtract, average or compare numbers.
- Write every number in digits, never in words (so the output check can see it). The headline uses words
  like "half" or "most" instead.
- If both an outstanding amount and the amount behind come up, explain why they differ, from
  `outstanding` ("R1 450 of it is only due today").
- Always say "this week" when quoting `onTimeRate`, so it isn't confused with the monthly on-time tile.
- Name at most 2 parents, by first name.
- End with exactly one suggested action: the first suggestion, as an option for the owner ("you
  could…"), never as an instruction. With no suggestions, one simple next step (e.g. look at Who's paid).
- Don't guess anyone's gender: repeat the name instead of he/she.
- Be kind about parents who are behind. Never blame, shame or suggest penalties, late fees,
  higher prices or cutting anyone off.
- No financial, legal or credit advice. No predictions about individuals beyond the data given.
- Write in the requested language, headline too: `en` English, `zu` isiZulu, `st` Sesotho, `tn` Setswana.
- Return plain text only. No markdown, no lists, no emoji, no links.

## Caching

- Store every attempt in the database (`AiSummary`). The page shows the latest successful summary for
  `businessId` + `language` + period.
- Reuse it for 24 hours or until a new payment is recorded, whichever comes first.
- After a failed attempt, show the fallback for 15 minutes before trying again (Refresh skips the wait).
- At most 20 OpenAI calls per business per SA day; after that, the fallback (a stale summary would show
  old numbers).
- Never call the API on every page load.

## Fallback

Show the rule-based insights (the same suggestions, as short template sentences) when:
- `AI_SUMMARY_ENABLED` is not `true` or `OPENAI_API_KEY` is missing
- the request fails or takes longer than 8 seconds
- the output is empty, too long (over 700 characters: a hard limit well above the 60 words asked for),
  has markdown, emoji, links or HTML, or contains a number that isn't in the input (amounts in any
  format, compared as cents; counts; the on-time % and received %; 7 days). Dates aren't in the input,
  so a date in the output fails too. The 60 words, 3 numbers and 2 names are asked for, not checked.
- the daily cap is reached, or the last attempt failed less than 15 minutes ago

Log only the failure type, never the prompt or response contents.

## UI

- Panel title: "This week in plain words"
- Language toggle: English · isiZulu · Sesotho · Setswana
- AI text: the first line is the headline, shown on its own line in semibold; the rest is one paragraph
  (line breaks after the first are joined up).
- Small label under the text: "AI-generated from your payment records. Check before acting."
  Only on AI text; the fallback says "Worked out from your payment records."
- The panel loads on its own (`<Suspense>`), so the rest of the dashboard never waits on OpenAI.
- A "Refresh" button is owner-only and rate-limited (max 5 per business per day).

## Tests (required)

- The request payload contains no phone numbers, account numbers, references, surnames or child names.
- One business's data never appears in another business's request.
- Missing key → fallback, no API call.
- Timeout or error → fallback.
- Output containing a number not in the input → fallback.
- Cached summary is reused within 24 hours.
- No code path sends AI output to `src/messaging/`.

## Security and POPIA notes

- Data goes to a provider outside South Africa, so we send only first names and totals, which keeps
  personal information to a minimum. Mention this in the privacy notice.
- The OpenAI API is called only from the server. The key is never logged.
- AI output is treated as untrusted text: render as plain text, never as HTML.
