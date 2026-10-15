#!/usr/bin/env node
/**
 * Renders the real prize card (components/prizes/PrizeCard.tsx) to a PNG, with no dev server
 * and nothing touching proxy.ts (docs/prize-gift-card-redesign-plan.md Phase 2, step 4):
 *   1. react-dom/server renders <PrizeCard> to static HTML;
 *   2. Tailwind (v3, our own tailwind.config.ts) compiles only the classes that HTML uses;
 *   3. Playwright's Chromium screenshots it at 2x.
 * Outside Next there is no next/font variable, so the harness page loads Nunito from Google
 * Fonts and sets --ht-font-body itself. The logo is inlined from public/brand/web/.
 *
 * Usage:
 *   npm run prize-card:render                          → tmp/prize-card.png (the sample $25 card)
 *   npm run prize-card:render -- --specimen            → tmp/prize-card-specimen.png (every state,
 *                                                        fronts then backs drawn face-down)
 *   npm run prize-card:render -- --email               → public/brand/email/prize-card-v2.png (the
 *                                                        welcome-email picture: sample card, 960 px
 *                                                        wide, flattened on #0f172a, palette PNG)
 *   npm run prize-card:render -- --specimen --width 288 --out tmp/prize-card-specimen-320.png
 * The single-card mode has a transparent background. Never overwrite a published /brand/* file
 * in place — a new picture gets a new file name (bump EMAIL_FILE below to -v2, …).
 */
const { mkdirSync, readFileSync, writeFileSync } = require("fs");
const { dirname, join, resolve } = require("path");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");
const { chromium } = require("playwright");
const tailwindConfig = require("../tailwind.config.ts");
const { PrizeCard } = require("../components/prizes/PrizeCard.tsx");
const { prizeCardBack, prizeCardFace, SAMPLE_PRIZE_CARD_FACE } = require("../lib/prizeCardFace.ts");

const ROOT = process.cwd();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

// A phone's content width: 390 px screen minus the page's 16 px gutters. `--width 288` shows a
// 320 px phone (the narrowest we support), where the logo shrinks to fit.
const EMAIL = flag("--email");
const EMAIL_FILE = "public/brand/email/prize-card-v2.png";
const EMAIL_BACKGROUND = "#0f172a"; // the email's surface colour; some clients paint transparency white
const EMAIL_MAX_BYTES = 60 * 1024;
const CARD_WIDTH_PX = EMAIL ? 384 : Number(option("--width", "358")) || 358;

const win = (fields) => ({
  challengeId: "c1",
  venueId: "v1",
  challengeName: "Live Trivia",
  challengeRules: "",
  winnerUserId: "u1",
  ...fields,
});
const REDEEMED_AT = "2026-10-01T00:00:00Z";

/** Every state Andrew signs off on, each built through the real prizeCardFace(). */
const SPECIMENS = [
  { caption: "Gift card, whole dollars", size: "list", face: prizeCardFace(win({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }), "Pacific Street") },
  { caption: "Gift card, with cents", size: "list", face: prizeCardFace(win({ prizeKind: "gift_card", prizeGiftCertificateAmount: 12.5 }), "The Tap Room") },
  {
    caption: "Menu item, free",
    size: "list",
    face: prizeCardFace(win({ prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 100 }), "Pacific Street"),
  },
  {
    caption: "Menu item, percent off",
    size: "list",
    face: prizeCardFace(win({ prizeKind: "menu_item", prizeMenuItem: "entree", prizeDiscountKind: "percent", prizeDiscountValue: 50 }), "Pacific Street"),
  },
  {
    caption: "Long item name (steps down a size)",
    size: "list",
    face: prizeCardFace(
      win({ prizeKind: "menu_item", prizeMenuItem: "other", prizeMenuItemName: "Chef's Tasting Platter for Two", prizeDiscountKind: "percent", prizeDiscountValue: 100 }),
      "Brunswick Social House & Kitchen",
    ),
  },
  {
    caption: "Menu item, dollars off",
    size: "list",
    face: prizeCardFace(win({ prizeKind: "menu_item", prizeMenuItem: "whole_order", prizeDiscountKind: "dollar", prizeDiscountValue: 10 }), "Pacific Street"),
  },
  { caption: "Redeemed", size: "list", face: prizeCardFace(win({ prizeType: "wine_bottle", prizeRedeemedAt: REDEEMED_AT }), "Pacific Street") },
  {
    caption: "Square gift card, used up",
    size: "list",
    face: prizeCardFace(win({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, prizeRedeemedAt: REDEEMED_AT, squareGiftCard: "used" }), "Pacific Street"),
  },
  { caption: "Large (redeem sheet)", size: "large", face: prizeCardFace(win({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }), "Pacific Street") },
  { caption: "No venue name", size: "list", face: prizeCardFace(win({ prizeKind: "gift_card", prizeGiftCertificateAmount: 50 }), null) },
];

// Phase 4: the backs (plan §2.8), drawn face-down through the real prizeCardBack().
const HOUR_MS = 3_600_000;
const hoursFromNow = (hours) => new Date(Date.now() + hours * HOUR_MS).toISOString();
const noop = () => {};
const backOf = (caption, fields, { size = "list", action = null, venue = "Pacific Street" } = {}) => {
  const prize = win({ claimedAt: hoursFromNow(-72), prizeExpiresAt: hoursFromNow(24 * 14), ...fields });
  return {
    caption,
    size,
    face: prizeCardFace(prize, venue),
    back: prizeCardBack(prize),
    action: action ? { label: action, onPress: noop } : undefined,
    initialFlipped: true,
  };
};
const LIVE_TRIVIA_WIN = "You finished 1st in Live Trivia the week of Oct 7";
SPECIMENS.push(
  backOf("Back: ready, staff Redeem", { prizeKind: "gift_card", prizeGiftCertificateAmount: 25, winDescription: LIVE_TRIVIA_WIN }, { action: "Redeem" }),
  backOf(
    "Back: expires today (red)",
    { prizeKind: "menu_item", prizeMenuItem: "entree", prizeDiscountKind: "percent", prizeDiscountValue: 50, prizeExpiresAt: hoursFromNow(6), winDescription: "You got the most NFL picks right in Week 6" },
    { action: "Redeem" },
  ),
  backOf("Back: redeemed (stamp; details stay readable)", {
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    prizeDiscountKind: "percent",
    prizeDiscountValue: 100,
    prizeRedeemedAt: hoursFromNow(-2),
    winDescription: LIVE_TRIVIA_WIN,
  }),
  backOf(
    "Back: Square gift card",
    { prizeKind: "gift_card", prizeGiftCertificateAmount: 25, squareGiftCard: "issued", prizeRedeemedAt: hoursFromNow(-30), winDescription: LIVE_TRIVIA_WIN },
    { action: "Show gift card" },
  ),
  backOf(
    "Back: long details (scrolls inside the card)",
    {
      prizeKind: "menu_item",
      prizeMenuItem: "other",
      prizeMenuItemName: "Chef's Tasting Platter for Two",
      prizeDiscountKind: "percent",
      prizeDiscountValue: 100,
      prizeRedeemedAt: hoursFromNow(-1),
      winDescription: "You got the most NFL picks right across the whole regular season at Brunswick Social House",
    },
    { venue: "Brunswick Social House & Kitchen" },
  ),
  backOf("Back: large (redeem sheet, no button)", { prizeKind: "gift_card", prizeGiftCertificateAmount: 25, winDescription: LIVE_TRIVIA_WIN }, { size: "large" }),
);

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineLogos = (html) =>
  html.replace(/src="(\/brand\/web\/[^"]+\.webp)"/g, (_, src) => {
    const bytes = readFileSync(join(ROOT, "public", src));
    return `src="data:image/webp;base64,${bytes.toString("base64")}"`;
  });

const cardMarkup = ({ face, size, back, action, initialFlipped }) =>
  renderToStaticMarkup(createElement(PrizeCard, { face, size, back, action, initialFlipped }));

const buildBody = (specimen) => {
  if (EMAIL) return `<div id="shot" style="width:${CARD_WIDTH_PX}px">${cardMarkup({ face: SAMPLE_PRIZE_CARD_FACE, size: "large" })}</div>`;
  if (!specimen) {
    const size = option("--size", "list");
    return `<div id="shot" class="inline-block p-8" style="width:${CARD_WIDTH_PX + 64}px">${cardMarkup({ face: SAMPLE_PRIZE_CARD_FACE, size })}</div>`;
  }
  // Under 360 px the sheet is one column in a viewport the card's own width plus the 16 px
  // gutters, so the card's small-phone (max-[359px]) rules apply as they would on that phone.
  const narrow = CARD_WIDTH_PX < 360;
  const cells = SPECIMENS.map(
    (item) => `<figure class="m-0" style="width:${CARD_WIDTH_PX}px">${cardMarkup(item)}
      <figcaption class="mt-4 text-footnote text-slate-400">${escapeHtml(item.caption)}</figcaption></figure>`,
  ).join("");
  return `<div id="shot" class="inline-grid ${narrow ? "grid-cols-1 gap-y-8 p-4" : "grid-cols-2 gap-x-10 gap-y-10 p-10"} bg-slate-950">
    <p class="${narrow ? "" : "col-span-2 "}m-0 text-footnote text-slate-400">Prize card specimen · real component · ${CARD_WIDTH_PX}px wide (a phone) · 2x</p>
    ${cells}</div>`;
};

const compileCss = async (html) => {
  const config = tailwindConfig.default ?? tailwindConfig;
  const result = await postcss([tailwindcss({ ...config, content: [{ raw: html, extension: "html" }] })]).process(
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    { from: undefined },
  );
  return result.css;
};

(async () => {
  const specimen = flag("--specimen");
  const out = resolve(ROOT, option("--out", EMAIL ? EMAIL_FILE : specimen ? "tmp/prize-card-specimen.png" : "tmp/prize-card.png"));
  const body = inlineLogos(buildBody(specimen));
  const css = await compileCss(body);

  const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400..900&display=block" rel="stylesheet">
<style>${css}
:root { --ht-font-body: "Nunito", system-ui, sans-serif; }
html, body { margin: 0; background: transparent; font-family: var(--ht-font-body); }
</style></head><body>${body}</body></html>`;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: EMAIL ? 2.5 : 2, viewport: { width: CARD_WIDTH_PX < 360 ? CARD_WIDTH_PX + 32 : 1200, height: 800 } });
    const tab = await context.newPage();
    await tab.setContent(page, { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    const nunito = await tab.evaluate(() => document.fonts.check('900 48px "Nunito"'));
    if (!nunito) console.warn("[prize-card:render] Nunito did not load (offline?) — the picture uses a fallback font.");
    mkdirSync(dirname(out), { recursive: true });
    const shot = await tab.locator("#shot").screenshot({ omitBackground: !specimen });
    const png = EMAIL
      ? await require("sharp")(shot).flatten({ background: EMAIL_BACKGROUND }).png({ palette: true, quality: 70, colours: 96, dither: 0.6, effort: 10 }).toBuffer()
      : shot;
    writeFileSync(out, png);
    console.log(`[prize-card:render] wrote ${out} (${Math.round(png.length / 1024)} KB)`);
    if (EMAIL && png.length > EMAIL_MAX_BYTES) {
      console.error(`[prize-card:render] ${Math.round(png.length / 1024)} KB is over the ${EMAIL_MAX_BYTES / 1024} KB email budget.`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
