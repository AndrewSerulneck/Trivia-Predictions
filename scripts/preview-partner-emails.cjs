#!/usr/bin/env node
// Writes the two partner emails to tmp/email-previews/ so their wording can be checked in a
// browser after editing lib/email/partnerEmailCopy.ts. Sample data only — sends nothing,
// reads no secrets, touches no database.
//
//   npm run email:preview
//
// Then open tmp/email-previews/welcome.html and venue-added.html (the .txt files are the
// plain-text versions mail apps show when HTML is off).
const { mkdirSync, writeFileSync } = require("fs");
const { join } = require("path");
const { buildWelcomeEmail } = require("../lib/email/welcomeEmail.ts");
const { buildVenueAddedEmail } = require("../lib/email/venueAddedEmail.ts");

const OUT = join(__dirname, "..", "tmp", "email-previews");
mkdirSync(OUT, { recursive: true });

const welcome = buildWelcomeEmail({
  venueName: "Pacific Street",
  ownerName: "Andrew",
  planAmountCents: 10000,
  dashboardUrl: "https://hightopchallenge.com/owner/dashboard",
});

const venueAdded = buildVenueAddedEmail({
  venueName: "Pacific Street — Hoboken",
  ownerName: "Andrew",
  venueCount: 2,
  thisVenueCents: 7500,
  newMonthlyTotalCents: 17500,
  chargedTodayCents: 3750,
  tvSetupUrl: "https://play.hightopchallenge.com/tv",
  dashboardUrl: "https://play.hightopchallenge.com/owner/dashboard",
});

for (const [name, email] of [
  ["welcome", welcome],
  ["venue-added", venueAdded],
]) {
  // Local images make file:// previews work before the new assets are deployed.
  const previewHtml = email.html.replace(/src="https?:\/\/[^/]+\/brand\/email\//g, 'src="../../public/brand/email/');
  writeFileSync(join(OUT, `${name}.html`), previewHtml);
  writeFileSync(join(OUT, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`${name}: "${email.subject}" → tmp/email-previews/${name}.html (+ .txt)`);
}
