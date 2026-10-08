import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { GOVERNING_LAW_STATE, LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/legalInfo";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using Hightop Challenge as a player or a venue partner.",
  alternates: { canonical: "/terms" },
  openGraph: { type: "article", url: "/terms", title: "Hightop Challenge Terms of Use" },
  twitter: { card: "summary", title: "Hightop Challenge Terms of Use" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      summary={`These terms are an agreement between you and ${LEGAL_ENTITY_NAME} about using Hightop Challenge, our games, website, Partner Dashboard and any mobile app. By creating an account or playing, you agree to them.`}
    >
      <LegalSection heading="Playing">
        <LegalList
          items={[
            "Hightop Challenge is free for players. There is no purchase, subscription or entry fee to play or to win.",
            "You must be at least 13 to create an account. Some venues, prizes and contests have higher age limits, such as 21+ for alcohol; the venue's rules and our Official Rules apply.",
            "You are responsible for your username and PIN. Do not share them, and tell us if you think someone else has access.",
            "Points and leaderboards are scoped to each venue. Points have no cash value.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Fair play">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "cheat, use bots or scripts, or fake your location or identity to join a venue you are not at;",
            "create multiple accounts to win prizes or distort leaderboards;",
            "use a username or answer that is hateful, harassing, sexual or impersonates someone else;",
            "interfere with the service, probe it for weaknesses, or resell or copy it.",
          ]}
        />
        <p>
          We may remove content, adjust or void scores, withhold prizes, or suspend or end an account that breaks these
          rules or the Official Rules.
        </p>
      </LegalSection>

      <LegalSection heading="Prizes">
        <p>
          Prizes are offered and fulfilled by the participating venue, not by Apple, Google or any app store. How a
          prize is earned, how long it lasts and how it is redeemed are set out in the Official Rules and on the coupon.
          We may change or end rewards, and a venue may stop honoring prizes if it stops participating, in which case
          we will try to give notice.
        </p>
      </LegalSection>

      <LegalSection heading="Venue partners">
        <p>
          Venues that subscribe to Hightop Challenge also agree to the plan, price and billing terms shown at
          checkout. Subscriptions are billed through Stripe and renew until cancelled from the Partner Dashboard.
          Partners are responsible for honoring the prizes they offer, for complying with laws that apply to their
          venue and promotions, and for the accuracy of their venue information. Contact {SUPPORT_EMAIL} to close a
          partner account.
        </p>
      </LegalSection>

      <LegalSection heading="Our content and your content">
        <p>
          Hightop Challenge, its games, questions, artwork and software belong to us or our licensors. We give you a
          limited, personal, non-transferable licence to use the service. You keep ownership of content you submit,
          such as a username or an answer, and you give us the right to use it to run and promote the service.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers and limits">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;. Games, scores and sports data may be
          delayed, incomplete or wrong, and we do not guarantee uninterrupted service. To the fullest extent the law
          allows, {LEGAL_ENTITY_NAME} and its owners, employees and partners are not liable for any loss or damage of
          any kind arising from your use of the service, and we will not pay damages for any claim. Nothing here
          limits liability that cannot be limited by law. Please play responsibly and never while driving.
        </p>
      </LegalSection>

      <LegalSection heading="Ending and changes">
        <p>
          You can stop using the service at any time and delete your account from the menu in the game, or ask us to. We may suspend or end the
          service or your access. We may update these terms; continuing to use Hightop Challenge after a change means
          you accept it. These terms are governed by the laws of the State of {GOVERNING_LAW_STATE}, and the state and
          federal courts in {GOVERNING_LAW_STATE} have jurisdiction, except where your local law requires otherwise.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
