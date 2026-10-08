import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/legalInfo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Hightop Challenge collects from players and venue partners, why, who we share it with, and how to ask us to delete it.",
  alternates: { canonical: "/privacy" },
  openGraph: { type: "article", url: "/privacy", title: "Hightop Challenge Privacy Policy" },
  twitter: { card: "summary", title: "Hightop Challenge Privacy Policy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={`${LEGAL_ENTITY_NAME} ("Hightop Challenge", "we", "us") runs venue-based games that people play on their phones at bars and restaurants. This policy explains what we collect, why, and the choices you have. It covers the Hightop Challenge website, the game at play.hightopchallenge.com, the Partner Dashboard, and any Hightop Challenge mobile app.`}
    >
      <LegalSection heading="Players: what we collect">
        <LegalList
          items={[
            <>
              <strong>Account.</strong> A username you choose and a PIN. We store the PIN only as a salted hash, never
              as readable text. If you set up a passkey (Face ID, Touch ID or a device screen lock), we store the
              passkey&apos;s public key; your fingerprint or face never leaves your device. We do not ask for your real
              name, email address or phone number to play.
            </>,
            <>
              <strong>Venue membership and game activity.</strong> Which venues you have joined, your points,
              leaderboard standing, answers, picks, bingo cards, fantasy lineups, rewards progress and prizes. Your
              username and points are visible to other players at the same venue on leaderboards.
            </>,
            <>
              <strong>Location.</strong> To confirm you are at a venue, the game asks your phone for its precise
              location, only after you allow it. Your phone sends the reading to our server, which compares it with the
              venue&apos;s boundary and then discards it: we do not store your coordinates. We keep only the result of
              the check (whether you were in range, roughly how far you were from the venue, and how accurate your
              phone said the reading was). We also record the ZIP code, city and state of the venues you join, to
              produce aggregate reports for venues and advertisers.
            </>,
            <>
              <strong>Prizes.</strong> Coupons you win, when you redeem them, and the venue where you redeemed. If a
              venue connects a point-of-sale system, a gift-card prize may be created with the venue&apos;s payment
              provider; we do not receive or store your payment card details.
            </>,
            <>
              <strong>Usage and device data.</strong> Session start and end times, which games you open, ad views and
              taps, your IP address and your browser or device type. If you use the share-to-story feature we record
              that you opened it and whether camera permission was granted; photos you take stay on your phone and are
              not uploaded to us.
            </>,
            <>
              <strong>Notifications.</strong> In-app notifications about prizes and games are saved to your account. If
              we offer phone push notifications, we will ask first, and we will store a device token to deliver them.
            </>,
            <>
              <strong>Camera.</strong> If a version of the app offers a QR scanner, the camera is used only to read the
              code you point it at. Nothing is recorded or stored.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Venue partners: what we collect">
        <LegalList
          items={[
            "Your email address, password (handled by our sign-in provider), venue name, street address and the map boundary you draw around your venue.",
            "Subscription and billing details held by Stripe. We receive your plan status, invoices and the last digits of your card, not the full card number.",
            "If you connect Square or Clover, an access token that lets us apply prizes at your register. Tokens are stored encrypted.",
            "Names, emails and phone numbers you give us through the contact and advertising forms.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="How we use it">
        <LegalList
          items={[
            "To run the games, keep scores and leaderboards, award and redeem prizes, and verify you are at a venue.",
            "To keep the service safe: preventing cheating, moderating usernames and answers, and rate-limiting abuse.",
            "To measure and improve the games, and to show venue partners and advertisers aggregate results.",
            "To show advertising. Ads in Hightop Challenge are chosen and served by us, not by an outside ad network, and we do not sell your personal information or use it to track you across other companies' apps and websites.",
            "To bill venue partners and to answer your questions.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Who we share it with">
        <p>
          We use service providers who process data for us under their own terms: Supabase (database and sign-in),
          Vercel (hosting), Stripe (partner billing), Google (address search and maps for partners), Resend (email),
          and Anthropic (to judge whether a Category Blitz answer fits its category and to screen answers for hateful
          or explicit content before they appear on a venue screen; only the answers and their categories are sent,
          never your username or account details). Venue partners who connect Square or Clover share
          prize and redemption information with that provider. If we add phone push notifications we will also use
          Google Firebase Cloud Messaging and Apple&apos;s notification service.
        </p>
        <p>
          We show the venue where you play your username, points and prize redemptions so it can run the competition
          and honor prizes. We may disclose information if the law requires it or to protect people&apos;s safety and
          our rights. If we are acquired, your information may transfer to the new owner under this policy.
        </p>
      </LegalSection>

      <LegalSection heading="Keeping and deleting your data">
        <p>
          We keep account and game data while your account is active. You can delete your account at any time from
          the menu in the game (&quot;Delete my account&quot;); it takes effect immediately and removes your account,
          your profile at every venue and the data tied to them, including your scores, which leave every
          leaderboard, and any prizes you have not used. We keep only records a venue needs that no longer identify
          you: that a reward&apos;s prize was given out, and a venue&apos;s gift-card ledger entry. If you can&apos;t
          sign in, email {SUPPORT_EMAIL} with your username and we will delete it for you. Details are on the{" "}
          <a href="/delete-account" className="underline">
            Delete Your Account
          </a>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices and rights">
        <p>
          You can turn off location permission in your phone settings (you will not be able to join venues that
          require a location check). You can ask to see, correct or delete your information by emailing {SUPPORT_EMAIL}.
          Depending on where you live, including California and other states with privacy laws, you may have
          additional rights to know what we hold, to delete it, and to not have it sold or shared for cross-context
          advertising. We do not sell personal information or share it for cross-context behavioral advertising, so
          there is nothing to opt out of. For the same reason we do not track you across other companies&apos; sites
          or apps, and the service works the same whether or not your browser sends a &quot;Do Not Track&quot; or
          Global Privacy Control signal.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Hightop Challenge is not directed to children under 13 and we do not knowingly collect their information. If
          you believe a child has created an account, email us and we will delete it. Venues serving alcohol may set
          their own age rules.
        </p>
      </LegalSection>

      <LegalSection heading="Security and changes">
        <p>
          We protect data with encryption in transit, hashed PINs and limited internal access, but no system is
          perfectly secure. We may update this policy; the date at the top shows the latest version, and we will
          highlight material changes in the app or on this page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
