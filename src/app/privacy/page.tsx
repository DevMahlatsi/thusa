import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage, LegalSection } from "@/components/legal-page";

// Privacy notice (POPIA). Plain words for parents first. Keep it in step with what the code actually
// stores and sends: docs/SECURITY.md, docs/AI.md, prisma/schema.prisma.

export const metadata: Metadata = { title: "Privacy notice · Thusa" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      intro={
        <>
          What Thusa keeps about parents and business owners, why, who sees it, and what you can ask for. It follows
          South Africa&apos;s Protection of Personal Information Act (POPIA).
        </>
      }
    >
      <LegalSection id="responsible" title="Who is responsible">
        <p>
          The business that collects fees from you through Thusa, usually your child&apos;s crèche, is responsible for your
          information. It is the one that invites you, and POPIA calls it the <em>responsible party</em>.
        </p>
        <p>
          Thusa is its <em>operator</em>. We handle your information for the business and on its instructions, only to
          collect its fees, and we keep it secure.
        </p>
        <p>For business owners, Thusa is responsible for your login and your business profile.</p>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <p>About parents:</p>
        <ul>
          <li>your name and cellphone number</li>
          <li>your child&apos;s first name</li>
          <li>your payment schedule: the amount, how often you pay (weekly, fortnightly or monthly) and your payday</li>
          <li>the language you want messages in</li>
          <li>your payment history: requests, payments, part-payments and reminders, with dates and references</li>
          <li>if you signed up from an invite link: the sentence you agreed to and when you agreed</li>
        </ul>
        <p>
          About business owners: your cellphone number and your business&apos;s name, town, province and ECD registration
          number.
        </p>
        <p>
          <strong>We never collect bank details or ID numbers.</strong> You pay on the payment provider&apos;s own secure
          page, and Thusa never sees your bank details.
        </p>
        <p>
          To stop misuse, we keep a one-way code made from your internet (IP) address, never the address itself. Owners
          get one login cookie. There are no advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection id="why" title="Why we use it">
        <ul>
          <li>to ask you for fees on your payday, with a payment link</li>
          <li>to match your payments and show the business who has paid</li>
          <li>to send polite reminders, and the balance if you paid part of a fee</li>
          <li>to let the business check and approve parents who sign themselves up</li>
        </ul>
        <p>
          We don&apos;t sell your information, use it for advertising or send you marketing. Messages are fixed, recognisable
          texts, and Thusa will never ask for your PIN or banking password.
        </p>
      </LegalSection>

      <LegalSection id="shared" title="Who we share it with">
        <p>Only what each service needs to do its job:</p>
        <ul>
          <li>
            <strong>Stitch, the payment provider:</strong> your name, the amount and the payment reference, to make your
            payment page.
          </li>
          <li>
            <strong>SMS and WhatsApp providers</strong> (Clickatell for SMS, Meta for WhatsApp): your cellphone number and
            the message, to deliver payment requests and reminders.
          </li>
          <li>
            <strong>The AI summary provider</strong> (OpenAI), when AI summaries are switched on: only totals, counts and
            parents&apos; first names, to write the owner a short weekly summary. Never phone numbers, surnames, children&apos;s
            names or payment references. OpenAI is outside South Africa, and we ask it not to keep what we send.
          </li>
          <li>
            <strong>Hosting:</strong> Vercel runs the app and Neon runs the database. They store the information for us.
          </li>
        </ul>
        <p>We only give information to the authorities when the law requires it.</p>
      </LegalSection>

      <LegalSection id="where" title="Where it's stored">
        <p>
          For now, the app runs on Vercel in Frankfurt, Germany, and the database is with Neon on Amazon Web Services, also
          in Frankfurt. Germany is in the European Union, which has strong data protection laws. Before launch we plan to
          move to Amazon Web Services in Cape Town.
        </p>
        <p>
          Parents&apos; cellphone numbers are encrypted in the database. Screens and logs only ever show the last four
          digits (••••4321).
        </p>
      </LegalSection>

      <LegalSection id="how-long" title="How long we keep it">
        <ul>
          <li>
            Payment history and schedules: while the business uses Thusa. When a parent leaves, the business removes them
            and Thusa stops messaging them, but their payment history stays, because businesses must keep financial
            records (usually for five years).
          </li>
          <li>Invite links stop working once they&apos;re used, or after 7 days.</li>
          <li>
            If an invite link is cancelled, the cellphone number the business gave for it is deleted straight away; if it
            runs out before it&apos;s used, within a day.
          </li>
          <li>
            If the business turns down a parent who signed themselves up, that parent&apos;s name and number are deleted
            straight away. The record of what they agreed to is kept as evidence.
          </li>
          <li>Login codes run out after 5 minutes and are only ever stored as one-way codes.</li>
          <li>The codes made from internet addresses for the sign-up page are deleted after 2 days.</li>
          <li>The demo account has made-up parents and is rebuilt every morning.</li>
        </ul>
        <p>How long we keep a business&apos;s records after it stops using Thusa will be decided before launch.</p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <p>You can ask:</p>
        <ul>
          <li>to see the information we hold about you</li>
          <li>to correct it if it&apos;s wrong</li>
          <li>
            to delete it, where the law allows. Payment records the business must keep can&apos;t be deleted, but they
            won&apos;t be used for anything else.
          </li>
          <li>to stop getting messages, by withdrawing your agreement</li>
        </ul>
        <p>
          Start with the business that invited you: it can correct or remove your details straight away. You can also
          contact us. If you&apos;re unhappy with how your information is handled, you can complain to the{" "}
          <a href="https://inforegulator.org.za" rel="noopener noreferrer">
            Information Regulator
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact us">
        <ContactLine />
        <p>
          See also the <Link href="/terms">terms of use</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
