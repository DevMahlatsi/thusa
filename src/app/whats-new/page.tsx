import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

// Changelog for judges and panel reviewers. Styled like /terms. No reviewer names.

export const metadata: Metadata = { title: "What's new · Thusa" };

export default function WhatsNewPage() {
  return (
    <LegalPage
      title="What's new"
      intro={<>Updated 26 October 2026, after panel feedback.</>}
    >
      <LegalSection id="changes" title="Since the last review">
        <ul>
          <li>
            Parents invite themselves and give consent, in <Link href="/parents/invites/new">Parents →{" "}Invite links</Link>.
          </li>
          <li>
            Reconciliation: every expected rand is accounted for, in <Link href="/collections">Collections</Link>.
          </li>
          <li>
            A terms of use and a POPIA privacy notice, with a contact address: see <Link href="/terms">Terms</Link> and{" "}
            <Link href="/privacy">Privacy</Link>.
          </li>
          <li>
            &ldquo;How Thusa compares&rdquo;, by product category, on the <Link href="/#compare-title">landing page</Link>.
          </li>
          <li>
            Payment history is described as a record, not proof of income or creditworthiness, in{" "}
            <Link href="/terms#record">Terms</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="pilot" title="Pilot-first plan">
        <p>
          Crèches only, for now. We&apos;re measuring on-time collections, follow-up time, cash-flow predictability and
          owner satisfaction before taking Thusa to other kinds of businesses.
        </p>
      </LegalSection>

      <LegalSection id="next" title="Next">
        <ul>
          <li>FNB APIs in production</li>
          <li>DebiCheck mandates</li>
          <li>Failed-payment links and disputes</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
