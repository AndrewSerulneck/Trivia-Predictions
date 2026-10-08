import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/legalInfo";

export const metadata: Metadata = {
  title: "Official Rules",
  description:
    "Official contest rules for Hightop Challenge venue rewards: no purchase necessary, how winners are chosen, eligibility and prizes.",
  alternates: { canonical: "/rules" },
  openGraph: { type: "article", url: "/rules", title: "Hightop Challenge Official Rules" },
  twitter: { card: "summary", title: "Hightop Challenge Official Rules" },
};

export default function RulesPage() {
  return (
    <LegalPage
      title="Official Rules"
      summary="These rules apply to the rewards, challenges and prizes offered through Hightop Challenge at participating venues. NO PURCHASE NECESSARY. Playing and winning do not require buying anything."
    >
      <LegalSection heading="Not sponsored by Apple or Google">
        <p>
          <strong>
            Apple Inc. and Google LLC are not sponsors of, and are not involved in, any contest, reward, challenge or
            sweepstakes on Hightop Challenge. Prizes are provided by the participating venue, not by Apple or Google.
          </strong>
        </p>
      </LegalSection>

      <LegalSection heading="Sponsor">
        <p>
          Rewards are run by {LEGAL_ENTITY_NAME} together with the participating bar or restaurant (the
          &quot;venue&quot;) named on each reward. The venue supplies and honors the prize.
        </p>
      </LegalSection>

      <LegalSection heading="How to enter: no purchase necessary">
        <p>
          Hightop Challenge is free. To take part, create a free account and join a participating venue from within its
          boundary. You do not have to buy food, drink or anything else, and a purchase does not improve your chances.
          Games that need no purchase are available to every eligible player at the venue.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <LegalList
          items={[
            "Open to legal residents of the United States who are at least 18 years old, or the age of majority where they live if higher. Prizes involving alcohol are limited to people 21 or older.",
            "You must be physically at the participating venue when you play.",
            "One account per person. Employees of Hightop Challenge and of the venue offering the reward may play but may not win that venue's prizes.",
            "Void where prohibited by law. Rewards are skill-based; they are not a lottery or game of chance.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="How winners are chosen">
        <p>
          Each reward states a goal on the venue&apos;s Rewards panel: for example, earning a number of points in a game
          within a week or season, or making the most correct picks. A player wins by meeting the stated goal within
          the stated period, in the order shown by our records. Where a reward has a limited number of prizes, the
          first players to qualify win until the prizes run out. Where a reward is won by the most correct picks, a
          minimum number of participants may be required and ties are broken by the tiebreaker shown for that reward.
          Our records and decisions about scoring are final.
        </p>
      </LegalSection>

      <LegalSection heading="Prizes and redemption">
        <p>
          Prizes are things like a discount on a menu item or a gift card, and are of modest value as described on each
          reward. Winners are notified in the app and receive a coupon in Redeem Prizes. To redeem, show the live
          coupon to venue staff while at the venue, then confirm. Each coupon can be redeemed once. Coupons expire on
          the date shown, have no cash value, may not be transferred or exchanged, and are subject to the
          venue&apos;s reasonable conditions. Winners are responsible for any taxes on a prize.
        </p>
      </LegalSection>

      <LegalSection heading="General">
        <p>
          We may disqualify anyone who cheats, tampers with the game or breaks the Terms of Use, and may end, change
          or cancel a reward if it cannot run as planned. By taking part you agree to these rules and to the decisions
          of {LEGAL_ENTITY_NAME}, which are final. A winner&apos;s username may be shown to other players at the venue.
          Questions or a list of winners: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
