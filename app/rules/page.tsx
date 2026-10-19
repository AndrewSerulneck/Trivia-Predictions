import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/legalInfo";
import { isBracketsEnabled, isSquaresEnabled, SQUARES_PER_PLAYER_CAP } from "@/lib/seasonalGames";
import { BRACKET_ROUND_POINTS } from "@/lib/seasonalPoints";
import { BRACKET_GAME_NAME, SQUARES_GAME_NAME } from "@/lib/venueGameCards";

export const metadata: Metadata = {
  title: "Official Rules",
  description:
    "Official contest rules for Hightop Challenge venue prizes: no purchase necessary, how winners are chosen, eligibility and what you can win.",
  alternates: { canonical: "/rules" },
  openGraph: { type: "article", url: "/rules", title: "Hightop Challenge Official Rules" },
  twitter: { card: "summary", title: "Hightop Challenge Official Rules" },
};

export default function RulesPage() {
  // The seasonal games' rules appear only once a game's flag is on (build-time NEXT_PUBLIC_* flags,
  // lib/seasonalGames.ts). Bump LEGAL_LAST_UPDATED when a flag is turned on.
  const squares = isSquaresEnabled();
  const brackets = isBracketsEnabled();
  return (
    <LegalPage
      title="Official Rules"
      summary="These rules apply to the prizes and challenges offered through Hightop Challenge at participating venues. NO PURCHASE NECESSARY. Playing and winning do not require buying anything."
    >
      <LegalSection heading="Not sponsored by Apple or Google">
        <p>
          <strong>
            Apple Inc. and Google LLC are not sponsors of, and are not involved in, any contest, prize, challenge or
            sweepstakes on Hightop Challenge. Prizes are provided by the participating venue, not by Apple or Google.
          </strong>
        </p>
      </LegalSection>

      <LegalSection heading="Sponsor">
        <p>
          Prizes are run by {LEGAL_ENTITY_NAME} together with the participating bar or restaurant (the
          &quot;venue&quot;) named on each prize. The venue supplies and honors it.
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
            "One account per person. Employees of Hightop Challenge and of the venue offering a prize may play but may not win that venue's prizes.",
            squares
              ? `Void where prohibited by law. Prizes are skill-based, except ${SQUARES_GAME_NAME}, whose winning squares depend on randomly drawn numbers. It is free to enter and nothing is ever paid to play, so it is not a lottery.`
              : "Void where prohibited by law. Prizes are skill-based; they are not a lottery or game of chance.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="How winners are chosen">
        <p>
          Each prize states a goal on the venue&apos;s Prizes panel: for example, earning a number of points in a game
          within a week or season, or making the most correct picks. A player wins by meeting the stated goal within
          the stated period, in the order shown by our records. Where a prize is limited in number, the
          first players to qualify win until they run out. Where a prize is won by the most correct picks, a
          minimum number of participants may be required and ties are broken by the tiebreaker shown for that prize.
          Our records and decisions about scoring are final.
        </p>
      </LegalSection>

      {squares ? (
        <LegalSection heading={SQUARES_GAME_NAME}>
          <LegalList
            items={[
              `Free to enter. Each player may claim up to ${SQUARES_PER_PLAYER_CAP} open squares on their venue's board, first come, first served, until 30 minutes before kickoff. Every square's owner is shown to other players at the venue.`,
              "The row and column numbers (0 to 9) are then drawn at random by our server. Nobody, including the venue, sees them before the draw.",
              "At the end of the first quarter, halftime, the end of the third quarter and the final score (including overtime), the player holding the square that matches the last digit of each team's score wins that moment's venue points and any prize the venue offers for it.",
              "If nobody holds the winning square, nobody wins that moment, and nothing carries over.",
            ]}
          />
        </LegalSection>
      ) : null}

      {brackets ? (
        <LegalSection heading={BRACKET_GAME_NAME}>
          <LegalList
            items={[
              "Free to enter. One bracket per player per tournament at each venue, for the men's and women's tournaments, plus a second-chance bracket for each that starts at the Sweet 16.",
              "Picks lock when the first game of the Round of 64 tips off (second chance: the first Sweet 16 game). Locked picks cannot be changed.",
              `Each correct pick scores ${BRACKET_ROUND_POINTS.join(", ")} points, by round. Ties are broken by the closest guess at the championship game's total points, then by the bracket submitted first.`,
              "Where a venue offers prizes for places, they go to the highest-scoring brackets at that venue.",
            ]}
          />
        </LegalSection>
      ) : null}

      {squares || brackets ? (
        <LegalSection heading="Not affiliated with any league">
          <p>
            Hightop Challenge is not affiliated with, sponsored or endorsed by the NFL, the NCAA or any team. Event names
            are used only to describe the real games these contests follow, and belong to their owners.
          </p>
        </LegalSection>
      ) : null}

      <LegalSection heading="Prizes and redemption">
        <p>
          Prizes are things like a discount on a menu item or a gift card, and are of modest value as described on each
          one. Winners are notified in the app and receive a coupon in Redeem Prizes. To redeem, show the live
          coupon to venue staff while at the venue, then confirm. Each coupon can be redeemed once. Coupons expire on
          the date shown, have no cash value, may not be transferred or exchanged, and are subject to the
          venue&apos;s reasonable conditions. Winners are responsible for any taxes on a prize.
        </p>
      </LegalSection>

      <LegalSection heading="General">
        <p>
          We may disqualify anyone who cheats, tampers with the game or breaks the Terms of Use, and may end, change
          or cancel a prize if it cannot run as planned. By taking part you agree to these rules and to the decisions
          of {LEGAL_ENTITY_NAME}, which are final. A winner&apos;s username may be shown to other players at the venue.
          Questions or a list of winners: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
