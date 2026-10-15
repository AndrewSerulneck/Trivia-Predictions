/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PARTNER EMAIL WORDING — edit this file to change what partners are sent.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every word of the two partner emails lives here, as plain text:
 *
 *   1. WELCOME_EMAIL      — sent once, when a new partner's subscription starts.
 *   2. VENUE_ADDED_EMAIL  — sent when a partner adds another venue to their bill
 *                           (multi-venue billing; wired up in Phase 3 of
 *                           docs/multi-venue-volume-billing-plan.md).
 *
 * HOW TO EDIT
 *   - Change the text between the quote marks. Keep the quote marks and the comma
 *     at the end of each line.
 *   - Words in {curly braces} are filled in automatically — keep them spelled
 *     exactly as shown (you can move them around or delete them):
 *       {venueName}        the venue's name, e.g. "Pacific Street"
 *       {ownerName}        the partner's name (greeting lines only)
 *       {planAmount}       the monthly price, e.g. "$100.00"
 *       {thisVenueAmount}  what the added venue costs per month, e.g. "$75.00"
 *       {monthlyTotal}     the partner's new monthly total, e.g. "$175.00"
 *       {venueCount}       how many venues are on the bill, e.g. "2"
 *       {chargedToday}     what was charged today for the rest of this month
 *   - Apostrophes are fine inside "double quotes" ("you're", "Joe's").
 *   - To preview your changes, run:  npm run email:preview
 *     It writes both emails to tmp/email-previews/ — open the .html files in a browser.
 *   - Nothing here can break billing: the worst a typo can do is make an email look wrong,
 *     and `npm run test` checks both emails still build.
 *
 * Layout (colours, spacing, button shapes) is in lib/email/welcomeEmail.ts and
 * lib/email/venueAddedEmail.ts — you should not need to touch those to change wording.
 */

export const WELCOME_EMAIL = {
  /** The email's subject line. */
  subject: "Welcome to Hightop Challenge — you're live!",

  /** Greeting when we know the partner's name, and when we don't. */
  greetingWithName: "Hi {ownerName},",
  greetingWithoutName: "Hi there,",

  /** Big heading at the top. */
  heading: "Welcome to Hightop Challenge",

  /** Small celebratory label above the welcome heading. */
  eyebrow: "Let the games begin!",

  /** The line under the heading. */
  confirmation: "Thank you for subscribing to Hightop Challenge! Your subscription for {venueName} is active — you're all set at {planAmount}/mo.",

  /** Second opening paragraph, introducing the subscription's features. */
  introduction: "Below we explain the features that come with an HTC subscription and how you can use them to generate revenue for your business.",

  /** Heading above the feature list. */
  featureTourHeading: "What you can do from your Partner Dashboard:",

  /** The feature tour: one entry per Partner Dashboard feature. Add, remove or reorder freely. */
  featureTour: [
    {
      title: "Schedule Live Games",
      body: "Put Category Blitz or Live Trivia on the calendar for game nights — pick a time, we handle the rest.",
    },
    {
      title: "Offer Rewards",
      body: "If you want to boost engagement, offer a prize for winning games on HTC! Offer a gift card to the user who wins at Trivia night, or a discount coupon to the user who gets the most picks right on NFL Sunday. These are just a few of many ways a Hightop Challenge subscription helps you attract more foot traffic.",
    },
    {
      title: "Apply Rewards with Square",
      body: "Hightop Challenge is integrated with Square. If your business uses Square, the rewards you offer can be applied straight to the winner's check. Just head to the Partner Dashboard and click \"Point of Sale,\" then \"connect.\"",
    },
    {
      title: "Promote games and rewards on social media",
      body: "When you schedule Live Games or offer Rewards, you're prompted to generate social media content to advertise the promotions you're offering. Share it on your social channels so guests know about the promotion, come play, and spend more of their time and money at your venue.",
    },
    {
      title: "Put it on your TVs",
      body: "Let other guests follow the games on your TVs by heading to your Partner Dashboard and clicking 'Venue Display.' Then follow the instructions to link a TV so other guests can follow along even if they are not playing on their phones.",
    },
    {
      title: "Get guests straight to the games with QR merch",
      body: "Make it easier for guests to find Hightop Challenge's app and website: visit the store in your Partner Dashboard and order merch with our QR code on it. We sell coasters, table tents, and other bar products that guests can scan to get straight to the games. You'll also find a free downloadable QR code you can print out or put on your own merch, including your menus.",
    },
    {
      title: "Manage billing anytime",
      body: "View invoices, update your card, or change plans from the Partner Dashboard whenever you need to.",
    },
    {
      title: "The Partner Manual",
      body: "If you forget anything we just said, don't worry! Visit the Partner Manual in the Partner Dashboard if you need to see this information again, or you can reach out to support@hightopchallenge.com anytime with questions!",
    },
  ],

  /** Where guests find a prize after winning a Reward (with a picture of the digital gift card). */
  prizesSection: {
    title: "Where guests find their prizes",
    body: "When a guest wins one of your Rewards, we let them know right away. Their prize appears as a digital gift card in Redeem Prizes, in the Hightop Challenge menu. To use it, they tap the card to flip it over, then tap Redeem on the back. Your staff tap the card (it sparkles and shows the live time, so a screenshot won't work), and the guest taps Confirm Redemption. If you use Square, gift cards can be rung up like any other Square gift card.",
    imageAlt: "A Hightop Challenge digital gift card for $25",
    /** Versioned file in public/brand/email/. New artwork gets a new name (-v2), never an overwrite. */
    imageFile: "prize-card-v2.png",
  },

  /** Heading above the list of games. */
  gamesHeading: "Games your guests can play",

  /** The games guests can play, listed so partners know what they're offering. */
  games: ["Live Trivia", "Speed Trivia", "Category Blitz", "Pick'em", "Prop Bingo", "Fantasy Sports"],

  /** Note beneath the games about new features and email updates. */
  gamesUpdateNote: "Our team is constantly adding new games and features. Whenever we add a new way to help you boost revenue in the app, we'll be sure to notify you via email.",

  /** The main button (opens the Partner Dashboard). */
  dashboardLink: "Click here to open your Partner Dashboard and get started!",

  /** Social profiles — buttons open each profile so the recipient can tap Follow. */
  socialFollow: {
    heading: "Follow us on social media",
    body: "Follow @thehightopchallenge on Instagram and Hightop Challenge on Facebook for tips on how to use Hightop Challenge to drive traffic, updates, and inspiration for your game nights.",
    profiles: [
      {
        platform: "Instagram",
        handle: "@thehightopchallenge",
        icon: "instagram-v1.png",
        button: "Follow us on Instagram",
        url: "https://www.instagram.com/thehightopchallenge/",
      },
      {
        platform: "Facebook",
        handle: "Hightop Challenge",
        icon: "facebook-v1.png",
        button: "Follow us on Facebook",
        url: "https://www.facebook.com/profile.php?id=61591104191392",
      },
    ],
  },

  /** Sign-off at the bottom. Start a new line with \n. */
  signOff: "See you on game night,\nThe Hightop Challenge team",
};

export const VENUE_ADDED_EMAIL = {
  /** The email's subject line. */
  subject: "{venueName} is now live on Hightop Challenge",

  greetingWithName: "Hi {ownerName},",
  greetingWithoutName: "Hi there,",

  /** Big heading at the top. */
  heading: "{venueName} is live",

  /** The line under the heading. */
  intro:
    "{venueName} has been added to your Hightop Challenge account, and guests there can start playing right away.",

  /** Heading above the billing summary. */
  billingHeading: "Your updated bill",

  /** One line each in the billing summary. */
  thisVenueLine: "{venueName}: {thisVenueAmount}/mo",
  monthlyTotalLine: "New monthly total ({venueCount} venues): {monthlyTotal}/mo",
  /** Left out automatically when nothing was charged today. */
  chargedTodayLine: "Charged today: {chargedToday} (covers the rest of this billing month)",

  /** A short note under the billing summary. Set to "" to leave it out. */
  billingNote: "Every venue is on one monthly bill, and each extra venue costs less as you grow.",

  /** Heading above the next-steps list. */
  nextStepsHeading: "Get {venueName} ready for game night",

  /** Next steps for the new venue. Add, remove or reorder freely. */
  nextSteps: [
    {
      title: "Put it on the TVs",
      body: "Pair the TVs at {venueName} with a code from your Partner Dashboard.",
    },
    {
      title: "Schedule live games",
      body: "Pick {venueName} at the top of your Partner Dashboard, then add Live Trivia or Category Blitz to its calendar.",
    },
    {
      title: "Let guests know",
      body: "Put the join QR code (a free download in your Partner Dashboard's store) on tables so guests can scan and play.",
    },
  ],

  /** The main button (opens the TV pairing page). */
  tvButton: "Set up your TVs",

  /** The smaller link under it (opens the Partner Dashboard). */
  dashboardLink: "Open your Partner Dashboard now to get started",

  /** Sign-off at the bottom. Start a new line with \n. */
  signOff: "See you on game night,\nThe Hightop Challenge team",
};
