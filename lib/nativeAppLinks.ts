import "server-only";
import { hostKind } from "@/lib/domainSplit";

// The two files phones fetch to trust the app with our links and passkeys
// (docs/native-app-store-plan.md Phase 3; passkeys are Part B / Phase 4c):
//   /.well-known/apple-app-site-association  (iOS: Universal Links + webcredentials)
//   /.well-known/assetlinks.json             (Android: App Links + passkey credentials)
// Served by route handlers under app/.well-known/ on BOTH hosts, from server env
// vars (Vercel applies a changed env var on the next deployment — click
// "Redeploy" after setting them; CDN-cached for an hour):
//   APPLE_TEAM_ID            the paid Organization team's 10-character Team ID.
//   ANDROID_APP_CERT_SHA256  comma-separated SHA-256 signing-certificate fingerprints
//                            ("AB:CD:…", 32 bytes). Use the Play App Signing key from
//                            Play Console (and the upload key for internal testing).
// Unset or malformed → the file is a 404, so nothing claims our links until the
// accounts exist. ONE reader of these env vars.
//
// Only `play.` opens in the app. The apex holds the marketing pages, which the app
// sends OUT to the browser — claiming them would bounce a link between the two.
// The apex file still names the app for passkeys (RP ID hightopchallenge.com,
// lib/webauthn.ts).

/** The permanent store id (plan §2 item 11). Must equal native/capacitor.config.json appId. */
export const NATIVE_APP_ID = "com.hightopchallenge.app";

const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export const readAppleTeamId = (env: Readonly<Record<string, string | undefined>> = process.env): string | null => {
  const value = (env.APPLE_TEAM_ID ?? "").trim().toUpperCase();
  return TEAM_ID_PATTERN.test(value) ? value : null;
};

export const readAndroidCertFingerprints = (env: Readonly<Record<string, string | undefined>> = process.env): string[] =>
  (env.ANDROID_APP_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => FINGERPRINT_PATTERN.test(value));

/** Does this host's file claim links for the app? Only `play.` (and preview/local hosts, for testing). */
const claimsLinks = (host: string | null): boolean => hostKind(host) !== "apex";

type AppleAppSiteAssociation = {
  applinks: { details: Array<{ appIDs: string[]; components: Array<Record<string, string | boolean>> }> };
  webcredentials: { apps: string[] };
};

export const buildAppleAppSiteAssociation = (
  host: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): AppleAppSiteAssociation | null => {
  const teamId = readAppleTeamId(env);
  if (!teamId) return null;
  const appId = `${teamId}.${NATIVE_APP_ID}`;
  return {
    applinks: {
      details: claimsLinks(host)
        ? [
            {
              appIDs: [appId],
              components: [
                { "/": "/api/*", exclude: true, comment: "API calls are never app links" },
                { "/": "/*", comment: "Every game page, including / (the printed join QR)" },
              ],
            },
          ]
        : [],
    },
    webcredentials: { apps: [appId] },
  };
};

type AssetLinkStatement = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

export const buildAssetLinks = (host: string | null, env: Readonly<Record<string, string | undefined>> = process.env): AssetLinkStatement[] | null => {
  const fingerprints = readAndroidCertFingerprints(env);
  if (fingerprints.length === 0) return null;
  const relation = claimsLinks(host)
    ? ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"]
    : ["delegate_permission/common.get_login_creds"];
  return [
    {
      relation,
      target: { namespace: "android_app", package_name: NATIVE_APP_ID, sha256_cert_fingerprints: fingerprints },
    },
  ];
};

export const WELL_KNOWN_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
