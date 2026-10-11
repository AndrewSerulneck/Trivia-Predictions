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

  /** The line under the heading. */
  confirmation: "Your Hightop Challenge subscription for {venueName} is active — you're all set at {planAmount}/mo.",

  /** Heading above the feature list — plain-text version of the email only. */
  featureTourHeading: "What you can do from your Partner Dashboard:",

  /** The feature tour: one entry per Partner Dashboard feature. Add, remove or reorder freely. */
  featureTour: [
    {
      title: "Schedule live games",
      body: "Put Category Blitz or Live Trivia on the calendar for game nights — pick a time, we handle the rest.",
    },
    {
      title: "Put it on your TVs",
      body: "Link a TV in seconds with a pairing code, no typing URLs. Great for game nights and general ambiance between rounds.",
    },
    {
      title: "Manage billing anytime",
      body: "View invoices, update your card, or change plans from the Partner Dashboard whenever you need to.",
    },
  ],

  /** Heading above the list of games. */
  gamesHeading: "Games your guests can play",

  /** The games guests can play, listed so partners know what they're offering. */
  games: ["Trivia", "Category Blitz", "Pick'em", "Bingo", "Predictions", "Fantasy"],

  /** The main button (opens the TV pairing page). */
  tvButton: "Set up your TVs",

  /** The smaller link under it (opens the Partner Dashboard). */
  dashboardLink: "Open your Partner Dashboard",

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
  dashboardLink: "Open your Partner Dashboard",

  /** Sign-off at the bottom. Start a new line with \n. */
  signOff: "See you on game night,\nThe Hightop Challenge team",
};
