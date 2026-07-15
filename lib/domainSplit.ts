// Phase 6 — domain split (apex → marketing `/info`, `play.` → the game).
//
// Pure, dependency-free module shared by the edge gate (`proxy.ts`), server
// code, and the browser. It must stay runnable in the edge runtime and the
// client, so: no `server-only`, no Node built-ins, only `process.env` reads
// (NEXT_PUBLIC_* values are inlined at build time).
//
// Everything here is gated behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`. With the
// flag off (the default) the app behaves exactly as it did pre-Phase-6:
// single-origin, no host-based redirects, relative in-app links.

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Master flag. When false, none of the split logic engages. */
export const isDomainSplitEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED);

const normalizeHostValue = (raw: string, fallback: string): string => {
  const trimmed = (raw ?? "").trim().toLowerCase();
  return (trimmed || fallback).replace(/:\d+$/, "");
};

/** Marketing apex host, e.g. `hightopchallenge.com` (no scheme, no port). */
export const apexHost = (): string =>
  normalizeHostValue(process.env.NEXT_PUBLIC_APEX_HOST ?? "", "hightopchallenge.com");

/** Game host, e.g. `play.hightopchallenge.com` (no scheme, no port). */
export const playHost = (): string =>
  normalizeHostValue(process.env.NEXT_PUBLIC_PLAY_HOST ?? "", "play.hightopchallenge.com");

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

/** Absolute base URL for the marketing apex (e.g. `https://hightopchallenge.com`). */
export const apexBaseUrl = (): string =>
  stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL?.trim() || `https://${apexHost()}`);

/**
 * Absolute base URL for the game. Only diverges from the apex once the split is
 * enabled — so with the flag off the game keeps serving from the current origin.
 */
export const gameBaseUrl = (): string => {
  if (isDomainSplitEnabled()) {
    return stripTrailingSlash(process.env.NEXT_PUBLIC_PLAY_URL?.trim() || `https://${playHost()}`);
  }
  return apexBaseUrl();
};

const withLeadingSlash = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

/**
 * Absolute URL for a game route (venue screen, join links, share links). Always
 * absolute — used where an on-screen/QR/emailed URL must be fully qualified.
 * Points at `play.` once the split is enabled, otherwise the current apex.
 */
export const gameUrl = (path: string): string => `${gameBaseUrl()}${withLeadingSlash(path)}`;

/** Absolute URL for a marketing route (always on the apex). */
export const marketingUrl = (path: string): string => `${apexBaseUrl()}${withLeadingSlash(path)}`;

/**
 * Link target for a game route used inside marketing pages. Stays relative while
 * the split is off (so localhost/preview keep working), and becomes an absolute
 * cross-host link once enabled.
 */
export const gameHref = (path: string): string =>
  isDomainSplitEnabled() ? gameUrl(path) : withLeadingSlash(path);

/** Link target for a marketing route used inside the game. */
export const marketingHref = (path: string): string =>
  isDomainSplitEnabled() ? marketingUrl(path) : withLeadingSlash(path);

/**
 * Cross-subdomain cookie domain (e.g. `.hightopchallenge.com`) so a session set
 * on the apex remains valid on `play.`. Empty (host-only cookies) unless the
 * operator sets it — keeps localhost/preview cookies working untouched.
 */
export const cookieDomain = (): string => (process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? "").trim();

export type HostKind = "apex" | "play" | "other";

/** Classify an incoming request host. `www.` of the apex counts as apex. */
export const hostKind = (host: string | null | undefined): HostKind => {
  const normalized = normalizeHostValue(host ?? "", "");
  if (!normalized) return "other";
  const apex = apexHost();
  if (normalized === apex || normalized === `www.${apex}`) return "apex";
  if (normalized === playHost()) return "play";
  return "other";
};

export type PageKind = "marketing" | "game" | "neutral";

// User-facing marketing pages that live on the apex.
const MARKETING_PAGE_PREFIXES = ["/info", "/faqs", "/advertise", "/owner"];

const hasFileExtension = (pathname: string): boolean => /\.[a-z0-9]+$/i.test(pathname);

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Classify a pathname for host-split purposes. `neutral` routes are served on
 * whatever host receives them and are never redirected (APIs, assets, internal
 * admin) — cross-host redirects are only for top-level page navigations.
 */
export const classifyPage = (pathname: string): PageKind => {
  if (
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/brand") ||
    // TV pairing page (Phase 5b): owners type the apex URL (hightopchallenge.com/tv)
    // into TV browsers, so /tv must be served on whatever host receives it and
    // never bounced across hosts.
    pathname === "/tv" ||
    pathname.startsWith("/tv/") ||
    hasFileExtension(pathname)
  ) {
    return "neutral";
  }
  if (MARKETING_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return "marketing";
  }
  return "game";
};

export type DomainSplitDecision =
  | { action: "none" }
  | { action: "rewrite"; path: string }
  | { action: "redirect"; host: string };

const NO_DECISION: DomainSplitDecision = { action: "none" };

/**
 * Decide what the edge gate should do for a request, based on host + path.
 *
 * - Apex `/` rewrites to the marketing `/info` experience (URL stays `/`).
 * - Apex + a game page → redirect to the same path on `play.`.
 * - Play `/` rewrites to a temporary Coming Soon page (URL stays `/`).
 * - `play.` + a marketing page → redirect to the same path on the apex.
 * - Unknown hosts (localhost, preview) and the flag being off → no-op.
 */
export const decideDomainSplit = (
  host: string | null | undefined,
  pathname: string,
): DomainSplitDecision => {
  if (!isDomainSplitEnabled()) return NO_DECISION;

  const kind = hostKind(host);
  if (kind === "other") return NO_DECISION;

  const page = classifyPage(pathname);
  if (page === "neutral") return NO_DECISION;

  if (kind === "apex") {
    if (pathname === "/") return { action: "rewrite", path: "/info" };
    if (page === "game") return { action: "redirect", host: playHost() };
    return NO_DECISION;
  }

  // kind === "play": keep the long-term player host alive while the public
  // launch page is being prepared; send marketing pages back to the apex.
  if (pathname === "/") return { action: "rewrite", path: "/coming-soon" };
  if (page === "marketing") return { action: "redirect", host: apexHost() };
  return NO_DECISION;
};
