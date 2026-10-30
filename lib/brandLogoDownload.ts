/**
 * The free Hightop Challenge logo download in the Join Merch store, next to the
 * free QR code (docs/join-merch-store-plan.md). Pure data, safe in the browser.
 *
 * The file is a transparent PNG trimmed from public/brand/htc-logo.png, written
 * by `npm run brand:images` (scripts/optimize-brand-logo.cjs, which repeats the
 * path below). The on-screen preview reuses the already-cached 192 px WebP.
 */

export const BRAND_LOGO_DOWNLOAD = {
  src: "/store/logo/hightop-challenge-logo.png",
  download: "hightop-challenge-logo.png",
} as const;

export const BRAND_LOGO_PREVIEW_SRC = "/brand/web/htc-logo-192.webp";

/** Minimum long edge of the download, in px (≈ 3.3 in at 300 dpi). */
export const BRAND_LOGO_DOWNLOAD_MIN_PX = 1000;
