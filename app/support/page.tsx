import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL_LINKS, SUPPORT_EMAIL } from "@/lib/legalInfo";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Hightop Challenge: accounts, prizes, venues, and deleting your account.",
  alternates: { canonical: "/support" },
  openGraph: { type: "website", url: "/support", title: "Hightop Challenge Support" },
  twitter: { card: "summary", title: "Hightop Challenge Support" },
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Need a hand? Email us and a real person will reply, usually within one business day."
    >
      <LegalSection heading="Contact us">
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lg font-black underline">{SUPPORT_EMAIL}</a>
        </p>
        <p>Include your username and the venue you play at so we can find your account quickly. Never send your PIN.</p>
      </LegalSection>

      <LegalSection heading="Common questions">
        <LegalList
          items={[
            <>
              <strong>I can&apos;t join my venue.</strong> The game checks that you are inside the venue. Turn on
              location for your browser or app, step inside, and try again.
            </>,
            <>
              <strong>I forgot my PIN.</strong> Email us from the address on file for your venue, or sign in with Face
              ID or Touch ID if you set up a passkey.
            </>,
            <>
              <strong>My prize isn&apos;t showing.</strong> Open Redeem Prizes from the menu. If you won and don&apos;t
              see it, email us the reward and date.
            </>,
            <>
              <strong>Venue partners.</strong> The Partner Dashboard is on our website, not in the app: sign in
              in your web browser at hightopchallenge.com. Billing and subscription changes live there under
              Billing. To close a partner account, email us from the account email.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Delete your account">
        <p>
          You can delete your player account yourself: open the menu in the game and tap &quot;Delete my account&quot;.
          It takes effect immediately, removes your scores from leaderboards and forfeits unredeemed prizes. Can&apos;t
          sign in? Email {SUPPORT_EMAIL} with your username and the words &quot;delete my account&quot; and we will do it
          for you. Step-by-step instructions, and what we keep and remove, are on the{" "}
          <a href="/delete-account" className="underline">
            Delete Your Account
          </a>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection heading="Policies">
        <ul className="space-y-1.5">
          {LEGAL_LINKS.filter((link) => link.href !== "/support").map((link) => (
            <li key={link.href}>
              <a href={link.href} className="underline">{link.label}</a>
            </li>
          ))}
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
