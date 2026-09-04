type PartnerManualSubsection = {
  heading: string;
  body: string;
};

type PartnerManualSection = PartnerManualSubsection & {
  subsections?: readonly PartnerManualSubsection[];
};

/**
 * PARTNER MANUAL COPY
 *
 * Edit the `intro` and each section's `body` below to update the Partner
 * Manual. You do not need to change any dashboard or modal code.
 */
export const PARTNER_MANUAL: {
  intro: string;
  sections: readonly PartnerManualSection[];
} = {
  intro:
    "Hightop Challenge is a digital gaming and rewards platform designed to drive repeat visits and increase business for our partner venues.",
  sections: [
    {
      heading: "Schedule Live Games",
      body: "Schedule Live games like Live Trivia and Category Blitz using the Partner Dashboard. These are games that the whole room plays together at the same time. They are designed to foster a sense of community through friendly competion and shared experiences. Your users can just play to have fun, or you can offer rewards as an extra incentive to drive up dwell time and repeat visits (more on rewards below). ",
      subsections: [
                {
          heading: "Live Trivia",
          body: "Classic bar trivia the whole room plays together. Users must type out their answers. Each correct answer is worth 10 points. ",
        },
        {
          heading: "Category Blitz",
          body: "A fast-paced word game that the whole room plays together. Each round, a letter is revealed and users must race to name something in every category that starts with that letter. But be careful: Some rounds, the point is to list what they think the most popular answer will be. Other rounds, the point is to give what they think is a unique response. Each valid answer is worth 4 points.",
        }
      ],
    },
        {
      heading: "Other Games",
      body: "In addition to our live games, we also offer the following: ",
      subsections: [
        {
          heading: "NFL Pick 'Em",
          body: "Your guests compete to pick the most winners each week of the NFL season. Correct predictions are worth 10 points each.",
        },
        {
          heading: "Speed Trivia",
          body: "Multiple choice quizes that users can play solo, any time. Users are limited to 3 rounds every 30 minutes, and correct answers are worth 2 points each.",
        },
                {
          heading: "Prop Bingo",
          body: "Randomized Bingo boards are automatically generated where every square is a prop bet. Squares fill up as users watch the games on TV. 5 squares in a row means Bingo! A winning board is worth 50 points.",
        },
        {
          heading: "Fantasy Sports",
          body: "Users draft a roster using players in todays games. Fantasy points are awarded to the user based on how well their roster performs, just like traditional fantasy sports.",
        },
        {
          heading: "Pick 'Em",
          body: "Your guests compete to pick the most winners across every sport that day. Correct predictions are worth 10 points each.",
        },
      ],
    },
    {
      heading: "Offer Rewards",
      body: "Incentivize guests to visit by offering rewards for playing games and winning points. Using our platform, partners can offer coupons or discounts to guests who perform well in games. Schedule a Live Trivia game and offer a gift card to the winner. Or, offer a free appetizer to the guest who predicts the most NFL winners that week. These are just some ideas! You're free to use our platform however you want to bring guests in the door. Click \"Offer Rewards\" on the Partner Dashboard to get started.",
    },
    {
      heading: "Venue Display",
      body: "A Hightop Challenge subscription includes the ability to display group games like Live Trivia and Category Blitz on your TV screens so people who aren't playing on their phones can still follow along. Just click the 'Venue Display' button in the Partner Dashboard and follow the instructions on your TV (or device connected to the TV).",
    },
    {
      heading: "Billing",
      body: "Hightop Challenge is a subscription-based service. Partners pay monthly. All features only become available once you have entered your payment information.The Partner Dashboard includes a billing section where you can view your current plan, update your payment method, and manage your subscription.",
    },
  ],
} as const;
