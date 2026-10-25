import Link from "next/link";
import { LANGUAGE_NAMES } from "@/lib/business-options";
import type { Insights } from "@/lib/insights";
import { plainWords } from "@/lib/insights/sentences";
import { LANGUAGES, type Language } from "@/messaging/templates/types";
import { SamplePill } from "../status-pill";

// "This week in plain words": the week's numbers and suggestions as a few fixed sentences, in the language
// the owner picks. Plain text only. The language links keep the scroll position, so switching doesn't
// jump back to the top of the dashboard.
export function PlainWords({ insights, language, isSample }: { insights: Insights; language: Language; isSample: boolean }) {
  const { facts, ideas } = plainWords(insights, language);
  return (
    <section className="panel plain-words" aria-labelledby="plain-words-title">
      <div className="panel-header">
        <div>
          <h2 id="plain-words-title">This week in plain words</h2>
          <p className="subtitle">{insights.period.label}</p>
        </div>
        <div className="panel-tools">
          {isSample && <SamplePill />}
          <nav className="filter-tabs lang-tabs" aria-label="Summary language">
            {LANGUAGES.map((l) => (
              <Link
                key={l}
                href={`/dashboard?lang=${l}`}
                scroll={false}
                hrefLang={l}
                lang={l}
                aria-current={l === language ? "page" : undefined}
              >
                {LANGUAGE_NAMES[l]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="plain-words-text" lang={language}>
        <p>{facts.join(" ")}</p>
        {ideas.length > 0 && (
          <ul>
            {ideas.map((idea, i) => (
              <li key={i}>{idea}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="muted small plain-words-source">Worked out from your payment records.</p>
    </section>
  );
}
