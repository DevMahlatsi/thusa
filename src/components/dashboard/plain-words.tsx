import Link from "next/link";
import { aiSummariesOn, shownSummary, type ShownSummary } from "@/ai/stored-summary";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import type { ScheduledPayer } from "@/lib/dashboard";
import { buildInsights } from "@/lib/insights";
import { loadInsights } from "@/lib/insights/load";
import { sampleCollections, samplePayers } from "@/lib/sample-dashboard";
import { LANGUAGES, type Language } from "@/messaging/templates/types";
import { SamplePill } from "../status-pill";
import { ActionButton } from "./action-button";

// "This week in plain words": the week's numbers and suggestions in the language the owner picks. AI text
// when it's switched on and allowed (src/ai/stored-summary.ts), else the fixed sentences. Plain text only.
// The panel loads on its own inside <Suspense>, so the dashboard never waits on OpenAI.

type PanelProps = {
  businessId: string;
  payers: ScheduledPayer[];
  today: string;
  language: Language;
  isSample: boolean;
  // OWNER only, and only when AI summaries are on.
  canRefresh: boolean;
};

export async function PlainWordsPanel({ businessId, payers, today, language, isSample, canRefresh }: PanelProps) {
  // Sample data is worked out here and never goes to OpenAI.
  const insights = isSample
    ? buildInsights({ rows: sampleCollections(), payers: samplePayers(), today })
    : await loadInsights(businessId, payers, today);
  const summary = await shownSummary(businessId, insights, language, { isSample });
  return (
    <PlainWords
      period={insights.period.label}
      language={language}
      summary={summary}
      isSample={isSample}
      canRefresh={canRefresh && !isSample && aiSummariesOn()}
    />
  );
}

function Header({ period, language, isSample }: { period: string; language: Language; isSample: boolean }) {
  return (
    <div className="panel-header">
      <div>
        <h2 id="plain-words-title">This week in plain words</h2>
        <p className="subtitle">{period}</p>
      </div>
      <div className="panel-tools">
        {isSample && <SamplePill />}
        {/* Links keep the scroll position, so switching doesn't jump back to the top of the dashboard. */}
        <nav className="filter-tabs lang-tabs" aria-label="Summary language">
          {LANGUAGES.map((l) => (
            <Link key={l} href={`/dashboard?lang=${l}`} scroll={false} hrefLang={l} lang={l} aria-current={l === language ? "page" : undefined}>
              {LANGUAGE_NAMES[l]}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

// The AI's first line is its headline ("Half of this week's fees are in."); the rest is one paragraph.
function AiText({ text }: { text: string }) {
  const [headline, ...rest] = text.split("\n");
  return (
    <>
      <p className="plain-words-headline">{headline}</p>
      {rest.length > 0 && <p>{rest.join(" ")}</p>}
    </>
  );
}

type Props = { period: string; language: Language; summary: ShownSummary; isSample: boolean; canRefresh: boolean };

export function PlainWords({ period, language, summary, isSample, canRefresh }: Props) {
  return (
    <section className="panel plain-words" aria-labelledby="plain-words-title">
      <Header period={period} language={language} isSample={isSample} />
      <div className="plain-words-text" lang={language}>
        {summary.source === "ai" ? (
          <AiText text={summary.text} />
        ) : (
          <>
            <p>{summary.facts.join(" ")}</p>
            {summary.ideas.length > 0 && (
              <ul>
                {summary.ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="plain-words-foot">
        <p className="muted small">
          {summary.source === "ai"
            ? "AI-generated from your payment records. Check before acting."
            : "Worked out from your payment records."}
        </p>
        {canRefresh && (
          <ActionButton
            url="/api/ai-summary/refresh"
            body={{ language }}
            label="Refresh"
            busyLabel="Writing…"
            ariaLabel="Write this week's summary again"
            secondary
          />
        )}
      </div>
    </section>
  );
}

/** Shown while the summary loads. Static bars: no shimmer, no glow. */
export function PlainWordsSkeleton({ period, language, isSample }: { period: string; language: Language; isSample: boolean }) {
  return (
    <section className="panel plain-words" aria-labelledby="plain-words-title" aria-busy="true">
      <Header period={period} language={language} isSample={isSample} />
      <div className="plain-words-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="muted small plain-words-foot">Working out this week&apos;s summary…</p>
    </section>
  );
}
