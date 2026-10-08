import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { PLAYER_DELETE_ACCOUNT_PATH } from "@/lib/accountDeletionShared";
import { gameHref } from "@/lib/domainSplit";
import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/legalInfo";

// Public account-deletion page. Google Play's Data safety form requires a web URL that explains
// how to delete an account; this is it (native app store plan Phase 1b). The deletion itself
// happens on the signed-in player page at /account/delete.

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "How to delete your Hightop Challenge account and what happens to your data.",
  alternates: { canonical: "/delete-account" },
  openGraph: { type: "article", url: "/delete-account", title: "Delete Your Hightop Challenge Account" },
  twitter: { card: "summary", title: "Delete Your Hightop Challenge Account" },
};

export default function DeleteAccountInfoPage() {
  return (
    <LegalPage
      title="Delete Your Account"
      summary={`You can delete your Hightop Challenge account yourself, in the app or on the website, at any time. Deletion is immediate and permanent. ${LEGAL_ENTITY_NAME} is the developer of the Hightop Challenge app.`}
    >
      <LegalSection heading="How to delete your account">
        <LegalList
          items={[
            "Open Hightop Challenge in the app or at play.hightopchallenge.com and sign in.",
            "Open the menu and tap “Delete my account”.",
            "Read what will be deleted, type DELETE and tap “Delete my account”.",
          ]}
        />
        <p>
          <a href={gameHref(PLAYER_DELETE_ACCOUNT_PATH)} className="font-black underline">
            Go to Delete my account
          </a>{" "}
          (you will be asked to sign in first).
        </p>
        <p>
          Can&apos;t sign in? Email <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a> with your
          username and the words &quot;delete my account&quot;, and we will delete it for you.
        </p>
      </LegalSection>

      <LegalSection heading="What is deleted">
        <LegalList
          items={[
            "Your username, hashed PIN and passkeys.",
            "Your profile at every venue, with your points, scores, picks, bingo cards, answers, lineups and leaderboard places.",
            "Your prize coupons, including any you have not used yet. Unused prizes cannot be recovered.",
            "Your notifications, rewards progress, location-check results, sessions (including IP address and device type), ad and share activity.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="What is kept">
        <LegalList
          items={[
            "If you won a reward, the record that the venue gave out that prize is kept with your name removed, so the venue's prize count stays correct.",
            "If a prize became a Square gift card, the venue's record of that gift card (its amount and status) is kept for the venue's books, with no link to you.",
            "Totals that count many players together, which do not identify anyone.",
          ]}
        />
        <p>Nothing else is kept. There is no waiting period: deletion happens when you confirm.</p>
      </LegalSection>

      <LegalSection heading="Venue partners">
        <p>
          Partner (venue owner) accounts are tied to a paid subscription. To close one, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a> from the account&apos;s email
          address.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
