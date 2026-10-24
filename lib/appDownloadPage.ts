// The small "Get the app?" page behind hightopchallenge.com/app (docs/native-app-store-plan.md
// Phase 9g). Pure: returns small HTML with a local Nunito stylesheet (no player runtime, no scripts
// except the iPad check). Both choices are plain links, so it works without JavaScript.

import { JOIN_QR_URL } from "@/lib/joinQr";

export type AppAskDevice = "ios" | "android" | "ipad-maybe";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SITE_FALLBACK = "/info#app";

export const buildAppAskPage = (device: AppAskDevice, storeUrl: string): string => {
  const maybeIpad = device === "ipad-maybe";
  const store = escapeHtml(storeUrl);
  const primary = maybeIpad ? "Get the iPad app" : "Get the app";
  const secondary = maybeIpad
    ? `<a class="skip" href="${SITE_FALLBACK}">Continue to the website</a>`
    : `<a class="skip" href="${escapeHtml(JOIN_QR_URL)}">No thanks, play in the browser</a>`;
  // Touch screen → keep the page; a real Mac → on to the website.
  const script = maybeIpad
    ? `<script>if(!(navigator.maxTouchPoints>1))location.replace("${SITE_FALLBACK}");</script>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#020617">
<title>Get the Hightop Challenge app</title>
<link rel="stylesheet" href="/fonts/nunito-v1.css">
<style>
html,body{margin:0;background:#020617;color:#f8fafc;font-family:var(--ht-font-body)}
main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px 16px;text-align:center;box-sizing:border-box}
img{width:96px;height:96px}
p{margin:0;font-size:20px;line-height:1.3;max-width:20em}
a{display:block;box-sizing:border-box;width:100%;max-width:320px;border-radius:12px;font-size:17px;font-weight:700;text-decoration:none;padding:14px 16px}
.get{background:#38bdf8;color:#020617}
.skip{color:#cbd5e1;font-weight:500;font-size:15px}
</style></head><body><main>
<img src="/brand/web/htc-logo-96.webp" width="96" height="96" alt="Hightop Challenge">
<p>Hightop Challenge is better in the app</p>
<a class="get" href="${store}">${primary}</a>
${secondary}
</main>${script}</body></html>`;
};
