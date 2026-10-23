// Phone push tripwire (docs/native-app-store-plan.md Phase 5.1). Each rule below is a one-home rule from
// the plan; breaking one fails here before it can reach players.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(path.join(ROOT, rel))) {
      const child = `${rel}/${name}`;
      if (statSync(path.join(ROOT, child)).isDirectory()) walk(child);
      else if (/\.(ts|tsx)$/.test(name)) out.push(child);
    }
  };
  walk(dir);
  return out;
};

const APP_CODE = ["app", "components", "lib"].flatMap(sourceFiles);
const filesMatching = (pattern: RegExp): string[] => APP_CODE.filter((file) => pattern.test(read(file))).sort();

describe("push: one home for each thing", () => {
  it("only lib/push/fcm.ts reads the sender credential", () => {
    expect(filesMatching(/FCM_SERVICE_ACCOUNT_JSON/)).toEqual(["lib/push/fcm.ts"]);
  });

  it("only lib/push/fcm.ts talks to Google", () => {
    expect(filesMatching(/fcm\.googleapis\.com|oauth2\.googleapis\.com/)).toEqual(["lib/push/fcm.ts"]);
  });

  it("only lib/nativePush.ts calls the push plugin or the registry route", () => {
    expect(filesMatching(/["']FirebaseMessaging["']/).filter((file) => file !== "lib/nativeApp.ts")).toEqual([
      "lib/nativePush.ts",
    ]);
    expect(filesMatching(/["']\/api\/push\/devices["']/)).toEqual(["lib/nativePush.ts"]);
  });

  it("only lib/push/devices.ts writes push_devices", () => {
    const writers = APP_CODE.filter((file) =>
      /from\(\s*["']push_devices["']\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(read(file).replace(/\s+/g, " ")),
    );
    expect(writers).toEqual(["lib/push/devices.ts"]);
  });

  it("the registry route binds the player to the signed session and refuses without one", () => {
    const route = read("app/api/push/devices/route.ts");
    expect(route).toMatch(/resolveRequestUserId\(request/);
    expect(route).toMatch(/if \(!isSessionEnforced\(\)\)/);
    expect(route).toMatch(/parseNativeUserAgent\(request\.headers\.get\("user-agent"\)\)/);
  });
});

describe("push: hooks live in existing paths (no new cron)", () => {
  it("vercel.json gains no push cron", () => {
    expect(read("vercel.json")).not.toMatch(/push/i);
  });

  it("the outbox runs after the Bingo refresh, the reminders in the 5-minute Live Trivia sweep", () => {
    const bingo = read("app/api/cron/bingo-progress/route.ts");
    expect(bingo.indexOf("refreshSportsBingoProgress({")).toBeGreaterThan(-1);
    expect(bingo.indexOf("sendPendingNotificationPushes()")).toBeGreaterThan(bingo.indexOf("refreshSportsBingoProgress({"));
    expect(read("app/api/cron/resolve-live-trivia-winners/route.ts")).toMatch(/sendLiveGameStartPushes\(nowMs\)/);
  });

  it("the outbox reads the notifications table, so the SQL writers (Bingo, predictions) are covered", () => {
    expect(read("lib/push/outbox.ts")).toMatch(/rpc\("claim_notification_pushes"/);
  });
});

describe("push: the website and old app builds are untouched", () => {
  it("Sign Out removes the phone BEFORE the logout POST expires the session", () => {
    const signOut = read("components/navigation/SignOutButton.tsx");
    const body = signOut.slice(signOut.indexOf("export async function performSignOut"));
    expect(body.indexOf("disablePushForSignOut()")).toBeGreaterThan(-1);
    expect(body.indexOf("disablePushForSignOut()")).toBeLessThan(body.indexOf("fetch(LOGOUT_ENDPOINT"));
  });

  it("the push runtime is mounted only inside the app", () => {
    expect(read("components/ui/PlayerRuntime.tsx")).toMatch(/\{isApp \? <NativePushRuntime \/> : null\}/);
  });

  it("every app-side entry point checks the plugin first", () => {
    const client = read("lib/nativePush.ts");
    expect(client).toMatch(/hasNativeCapability\(PLUGIN\)/);
    for (const name of ["enablePush", "shouldAskForPush", "disablePushForSignOut", "shouldShowPushWelcome", "pushWelcomeHoldsPopupAds"]) {
      const start = client.indexOf(`export const ${name} = `);
      expect(start, name).toBeGreaterThan(-1);
      expect(client.slice(start, start + 400), name).toMatch(/isPushAvailable\(\)|isPushOptedIn\(\)/);
    }
  });

  it("promotional pushes have exactly one switch of their own, 'news' (Apple 4.5.4) — no other category", () => {
    expect(read("lib/pushCategories.ts")).toMatch(/export type PushCategory = "games" \| "prizes" \| "results" \| "news";/);
  });
});

describe("push: the first ask is our own screen (Phase 5.3)", () => {
  it("the welcome lives on Venue Home and waits for the home to be ready", () => {
    expect(read("components/venue/VenueHubClient.tsx")).toContain("<PushWelcomeScreen ready={contentReady} />");
    expect(filesMatching(/<PushWelcomeScreen\b/)).toEqual(["components/venue/VenueHubClient.tsx"]);
  });

  it("the phone's own prompt is asked only from a tap (enablePush), never while deciding", () => {
    const welcome = read("components/push/PushWelcomeScreen.tsx");
    expect(welcome).not.toMatch(/requestPermissions|callNative/);
    expect(welcome.indexOf("enablePush()")).toBeGreaterThan(welcome.indexOf("const accept = async"));
  });

  it("popup ads ask the welcome first, before any ad request", () => {
    const ads = read("components/ui/PopupAds.tsx");
    expect(ads.indexOf("await pushWelcomeHoldsPopupAds()")).toBeGreaterThan(-1);
    expect(ads.indexOf("await pushWelcomeHoldsPopupAds()")).toBeLessThan(ads.indexOf("await loadSlotAd(slot, options)"));
  });

  it("the ask promises only the pushes the server sends (5.4: the 'new games and prizes' line needs its sender)", () => {
    const copy = read("lib/pushCategories.ts");
    const words = copy.slice(copy.indexOf("export const PUSH_COPY"));
    // Loosened deliberately in 5.4 (it was "never promise new games/prizes"): the promise is allowed only
    // while both partner create routes really send it. Remove a hook and this fails until the words go too.
    if (/schedul|adds? (new )?(games|prizes)|new games?|news/i.test(words)) {
      expect(read("app/api/owner/schedule/route.ts")).toMatch(/announceAfterResponse\(\(\) => announceNewGame\(schedule\)\)/);
      expect(read("app/api/owner/rewards/route.ts")).toMatch(/announceAfterResponse\(\(\) => announceNewPrize\(venueId, reward\)\)/);
    }
    // The welcome lists one line per switch, so every promise has an off switch in the menu.
    expect(read("components/push/PushWelcomeScreen.tsx")).toMatch(/category: "news"/);
  });
});

describe("push: News from your bars (Phase 5.4)", () => {
  it("only lib/push/venueNews.ts claims an announcement, and the cap is one named constant", () => {
    expect(filesMatching(/["']claim_venue_news_push["']/)).toEqual(["lib/push/venueNews.ts"]);
    const news = read("lib/push/venueNews.ts");
    expect(news).toMatch(/export const VENUE_NEWS_DAILY_CAP = 5;/);
    expect(news.match(/p_daily_cap: [^,\n]+/g)).toEqual(["p_daily_cap: VENUE_NEWS_DAILY_CAP"]);
  });

  it("is sent only from the two partner create routes, after the save succeeded", () => {
    expect(filesMatching(/announceNew(Game|Prize)\(/).filter((file) => file !== "lib/push/venueNews.ts")).toEqual([
      "app/api/owner/rewards/route.ts",
      "app/api/owner/schedule/route.ts",
    ]);
    const schedule = read("app/api/owner/schedule/route.ts");
    expect(schedule.indexOf("announceNewGame(schedule)")).toBeGreaterThan(schedule.indexOf("await createOwnerSchedule({"));
    const rewards = read("app/api/owner/rewards/route.ts");
    expect(rewards.indexOf("announceNewPrize(venueId, reward)")).toBeGreaterThan(rewards.indexOf("await createReward({"));
  });

  it("every way to turn push on states the news pushes first (Apple 4.5.4 consent)", async () => {
    const { PUSH_COPY } = await import("@/lib/pushCategories");
    expect(PUSH_COPY.welcomeBenefits.news).toMatch(/new games and add prizes/);
    expect(PUSH_COPY.askBody).toMatch(/new games and prizes at your bars/);
    expect(PUSH_COPY.settingsOff).toMatch(/news from your bars/);
  });

  it("never holds up the partner's reply (Next's after)", () => {
    const news = read("lib/push/venueNews.ts");
    expect(news).toMatch(/import \{ after \} from "next\/server";/);
    expect(news).toMatch(/after\(run\)/);
  });
});

describe("push: the native shells", () => {
  it("both Firebase configs belong to the real app id and the project, never the spike", () => {
    const android = JSON.parse(read("native/android/app/google-services.json")) as {
      project_info: { project_id: string };
      client: Array<{ client_info: { android_client_info: { package_name: string } } }>;
    };
    expect(android.project_info.project_id).toBe("hightop-challenge-fdca1");
    expect(android.client.map((c) => c.client_info.android_client_info.package_name)).toEqual(["com.hightopchallenge.app"]);
    const ios = read("native/ios/App/App/GoogleService-Info.plist");
    expect(ios).toMatch(/<key>BUNDLE_ID<\/key>\s*<string>com\.hightopchallenge\.app<\/string>/);
    expect(ios).toMatch(/<key>PROJECT_ID<\/key>\s*<string>hightop-challenge-fdca1<\/string>/);
    expect(read("native/ios/App/App.xcodeproj/project.pbxproj")).toMatch(/GoogleService-Info\.plist in Resources/);
  });

  it("iPhone: AppDelegate hands APNs to the plugin; remote-notification mode; aps-environment entitlement", () => {
    const delegate = read("native/ios/App/App/AppDelegate.swift");
    expect(delegate).toMatch(/post\(name: \.capacitorDidRegisterForRemoteNotifications, object: deviceToken\)/);
    expect(delegate).toMatch(/post\(name: \.capacitorDidFailToRegisterForRemoteNotifications, object: error\)/);
    expect(delegate).toMatch(/Notification\.Name\.init\("didReceiveRemoteNotification"\)/);
    expect(read("native/ios/App/App/Info.plist")).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>remote-notification<\/string>/);
    expect(read("native/ios/App/App/App.entitlements")).toMatch(/<key>aps-environment<\/key>\s*<string>development<\/string>/);
  });

  it("iPhone: both build configs sign as the real app with the paid team and the entitlements (Part B)", () => {
    const project = read("native/ios/App/App.xcodeproj/project.pbxproj");
    expect(project.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.hightopchallenge\.app;/g)).toHaveLength(2);
    expect(project.match(/DEVELOPMENT_TEAM = 2U7HMXGQM3;/g)).toHaveLength(2);
    expect(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
    expect(project).not.toMatch(/com\.hightopchallenge\.spike|Z39Q54R94X/);
  });

  it("Android: the status-bar icon and tint are set for background pushes", () => {
    const manifest = read("native/android/app/src/main/AndroidManifest.xml");
    expect(manifest).toMatch(/default_notification_icon"\s+android:resource="@drawable\/ic_stat_notify"/);
    expect(manifest).toMatch(/default_notification_color"\s+android:resource="@color\/htc_notify_accent"/);
    expect(manifest).not.toMatch(/usesCleartextTraffic/);
  });
});
