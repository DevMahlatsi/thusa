import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage, LegalSection } from "@/components/legal-page";

// Terms of use, in plain words. The promises here are also rules in CLAUDE.md: Thusa never holds money,
// parents never pay Thusa fees, no late fees, amounts come from the owner's schedule.

export const metadata: Metadata = { title: "Terms of use · Thusa" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <>
          What Thusa does and doesn&apos;t do, for the businesses that use it and the parents who pay them. By using Thusa
          you agree to these terms.
        </>
      }
    >
      <LegalSection id="what" title="What Thusa is">
        <p>
          Thusa is software that helps a business, such as a crèche, ask for its fees, match payments and send reminders.
          The fees are agreed between the business and the parent. Thusa isn&apos;t part of that agreement.
        </p>
      </LegalSection>

      <LegalSection id="money" title="Thusa never holds your money">
        <p>
          Parents pay on the payment provider&apos;s secure page (Stitch). The money goes from the parent&apos;s bank,
          through the provider, to the business. Thusa never receives or holds it.
        </p>
        <p>Thusa will never ask for your PIN or banking password.</p>
      </LegalSection>

      <LegalSection id="no-fees" title="Parents never pay Thusa fees">
        <p>
          The business pays Thusa for the service. Parents pay only the fees the business sets. There&apos;s no Thusa fee
          and no extra charge for paying weekly or fortnightly. Your bank&apos;s own normal charges, if any, are between you
          and your bank.
        </p>
      </LegalSection>

      <LegalSection id="no-penalties" title="No late fees or penalties">
        <p>
          Thusa never adds late fees, interest or penalties, and a business can&apos;t add them through Thusa. Reminders are
          polite, fixed messages. If you pay part of a fee, you can pay the rest later.
        </p>
      </LegalSection>

      <LegalSection id="amounts" title="The business sets the amounts">
        <p>
          The business sets each fee and chooses whether a parent may pay weekly, fortnightly or monthly. Thusa works out
          the weekly or fortnightly amount from the monthly fee, so a year&apos;s payments add up to the same total (to the
          nearest cent).
        </p>
        <p>
          Parents can&apos;t change an amount in Thusa. If an amount looks wrong, speak to the business. When a parent signs
          themselves up, Thusa only asks them to pay once the business has approved their details.
        </p>
      </LegalSection>

      <LegalSection id="record" title="Payment history is a record, not proof">
        <p>
          Thusa&apos;s payment history shows what was asked for and paid through Thusa, for the business and the parent to
          keep track. It isn&apos;t proof of income, a bank statement, a credit score or a reference, and mustn&apos;t be used
          to decide whether someone is creditworthy.
        </p>
      </LegalSection>

      <LegalSection id="owners" title="What businesses agree to">
        <ul>
          <li>only add parents who have agreed to get payment requests and reminders</li>
          <li>keep parents&apos; details and fees correct, and remove parents who leave</li>
          <li>use parents&apos; information only to collect fees, as the privacy notice explains</li>
        </ul>
      </LegalSection>

      <LegalSection id="messages" title="Messages">
        <p>
          Parents get payment requests and reminders by SMS or WhatsApp, in English, isiZulu, Sesotho or Setswana. To stop
          getting them, ask the business to remove you.
        </p>
      </LegalSection>

      <LegalSection id="prototype" title="This is a prototype">
        <p>
          Thusa was built for the FNB App of the Year Hackathon 2026. Payments run in the payment provider&apos;s test mode,
          so no real money moves. The service may change, pause or stop at any time, and it&apos;s provided as it is,
          without guarantees.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes and questions">
        <p>These terms will be reviewed before launch. The date at the top shows the latest version.</p>
        <ContactLine />
        <p>
          How we handle personal information: see the <Link href="/privacy">privacy notice</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
