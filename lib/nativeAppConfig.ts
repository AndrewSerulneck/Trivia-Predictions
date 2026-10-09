import "server-only";

// The native app's remote settings (docs/native-app-store-plan.md Phase 3):
// the minimum-version gate and the store links. ONE reader of these env vars.
//
// They are SERVER env vars (no NEXT_PUBLIC_), read per request by
// GET /api/app/config. On Vercel an env var change applies to the NEXT
// deployment only, so after changing one click "Redeploy" (no code change, no
// rebuild of the app); phones see it within the CDN cache window (5 minutes):
//   NATIVE_APP_MIN_VERSION       e.g. "1.2.0" — below this the app shows "Please update". Unset = no gate.
//   NATIVE_APP_LATEST_VERSION    e.g. "1.3.0" — informational only (never nags).
//   NATIVE_APP_IOS_STORE_URL     https://apps.apple.com/…  (the "Update" button on iPhone)
//   NATIVE_APP_ANDROID_STORE_URL https://play.google.com/… (the "Update" button on Android)
// A malformed value is ignored (read as unset), never half-applied: a typo in
// the minimum must not lock every player out of the app.

export type NativeAppConfig = {
  minSupportedVersion: string | null;
  latestVersion: string | null;
  storeUrls: { ios: string | null; android: string | null };
};

const VERSION_PATTERN = /^\d+(?:\.\d+){0,2}$/;

const readVersion = (value: string | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return VERSION_PATTERN.test(trimmed) ? trimmed : null;
};

const readStoreUrl = (value: string | undefined, host: string): string | null => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && url.hostname === host ? url.toString() : null;
  } catch {
    return null;
  }
};

export const readNativeAppConfig = (env: Readonly<Record<string, string | undefined>> = process.env): NativeAppConfig => ({
  minSupportedVersion: readVersion(env.NATIVE_APP_MIN_VERSION),
  latestVersion: readVersion(env.NATIVE_APP_LATEST_VERSION),
  storeUrls: {
    ios: readStoreUrl(env.NATIVE_APP_IOS_STORE_URL, "apps.apple.com"),
    android: readStoreUrl(env.NATIVE_APP_ANDROID_STORE_URL, "play.google.com"),
  },
});
