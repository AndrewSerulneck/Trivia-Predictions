import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

// Named tripwire for docs/bingo-fullscreen-pwa-plan.md — run with
// `npm run test:pwa-contract`.
//
// Everything here is asserted WITHOUT a browser, on purpose. Per the master plan
// §4 (and this repo's two prior burns: the Category Blitz iOS keyboard tear and
// the preserve-3d flattening), a headless browser has no browser chrome at all,
// so "is the landscape board actually full screen" and "does standalone mode
// look right" are unreachable here and would report a false pass. Those live on
// docs/bingo-fullscreen-pwa-device-checklist.md and only Andrew can close them.
//
// What CAN be checked mechanically is the set of invariants that, if broken,
// silently destroy the feature for every already-installed user: the manifest's
// start_url, the absence of a service worker, the install prompt's inertness
// while its flag is off, and the landscape CSS staying out of portrait.

const repoRoot = process.cwd();

const read = (relativePath: string): string =>
  readFileSync(path.resolve(repoRoot, relativePath), "utf8");

const globalsSource = read("app/globals.css");
const pwaLibSource = read("lib/pwa.ts");
const bingoSource = read("components/bingo/SportsBingoHome.tsx");
const packageJson = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const SCANNED_ROOTS = ["app", "components", "lib", "hooks", "scripts", "public", "types"];
const SCANNED_FILES = ["proxy.ts", "next.config.ts"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);

function collectSourceFiles(): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (SCANNED_EXTENSIONS.has(path.extname(entry))) {
        files.push(full);
      }
    }
  };

  for (const root of SCANNED_ROOTS) {
    const full = path.resolve(repoRoot, root);
    try {
      if (statSync(full).isDirectory()) {
        walk(full);
      }
    } catch {
      // Optional directory (e.g. `hooks`) — nothing to scan.
    }
  }
  for (const file of SCANNED_FILES) {
    const full = path.resolve(repoRoot, file);
    try {
      if (statSync(full).isFile()) {
        files.push(full);
      }
    } catch {
      // Optional file.
    }
  }

  return files;
}

function filesMatching(pattern: RegExp): string[] {
  return collectSourceFiles()
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(repoRoot, file));
}

describe("PWA manifest contract", () => {
  it("keeps start_url and scope at the join flow, which is the only route that survives a cookie-less cold launch", () => {
    // THE highest-value guard in the plan. An installed app gets its own cookie
    // jar (master plan §3), so it cold-launches with no `tp_user_id`/`tp_sess`.
    // proxy.ts's auth gate bounces every non-public route in that state, so any
    // game route here means every launch opens on a redirect — and `start_url`
    // is baked into each install at install time, so the break is not fixable
    // for users who already installed.
    const emitted = manifest();

    expect(emitted.start_url).toBe("/");
    expect(emitted.scope).toBe("/");
  });

  it("omits `orientation` entirely", () => {
    // Locking orientation would break the entire feature: the enhanced board
    // this plan exists to enlarge is reached ONLY by rotating to landscape, and
    // a manifest `orientation` lock applies to the whole installed app.
    const emitted = manifest() as Record<string, unknown>;

    expect("orientation" in emitted).toBe(false);
  });

  it("declares standalone display with the icon set Phase 3 generated", () => {
    const emitted = manifest();

    expect(emitted.display).toBe("standalone");
    const icons = emitted.icons ?? [];
    expect(icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-512-maskable.png",
    ]);
    // Android needs a maskable icon or it renders the app in a white circle.
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("emits that same manifest from a real build, when one is present", () => {
    // `app/manifest.ts` is what Next serializes to /manifest.webmanifest, so the
    // assertions above already cover the emitted document — but if a build
    // artifact is lying around, check it directly rather than trusting that
    // equivalence. Skipped rather than failed when `.next` is absent, so the
    // guard stays runnable without a build.
    const builtPath = path.resolve(repoRoot, ".next/server/app/manifest.webmanifest.body");
    let built: string;
    try {
      built = readFileSync(builtPath, "utf8");
    } catch {
      return;
    }

    const parsed = JSON.parse(built) as Record<string, unknown>;
    expect(parsed.start_url).toBe("/");
    expect(parsed.scope).toBe("/");
    expect("orientation" in parsed).toBe(false);
  });

  it("has exactly one manifest source — the app-router route, not a stray static file", () => {
    // A `public/manifest.json` would be served at a different URL but could be
    // linked by hand from a future <head> edit, giving two manifests that drift.
    const strays = ["public/manifest.json", "public/manifest.webmanifest", "public/site.webmanifest"];
    for (const stray of strays) {
      expect(() => statSync(path.resolve(repoRoot, stray))).toThrow();
    }

    // Next emits the <link rel="manifest"> for app/manifest.ts automatically;
    // a hand-written one in layout would point at whatever path it names.
    expect(read("app/layout.tsx")).not.toContain('rel="manifest"');
  });

  it("keeps the legacy iOS standalone meta tag that Next's metadata API does not emit", () => {
    // Phase 3 discovery: `appleWebApp.capable` only emits the modern unprefixed
    // `mobile-web-app-capable`, which WebKit honors from iOS 17.4+. Without the
    // legacy tag, older iPhones install the app and then launch it WITH Safari
    // chrome — i.e. the exact bug this plan set out to fix.
    expect(read("app/layout.tsx")).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />'
    );
  });
});

describe("PWA service-worker prohibition", () => {
  it("registers no service worker anywhere in the app", () => {
    // Master plan §2, settled and binding: NO SERVICE WORKER, in any phase.
    // Offline caching is where PWAs break Next.js apps — stale HTML, cached auth
    // redirects, mismatched RSC payloads. iOS does not need one to install.
    expect(filesMatching(/serviceWorker\s*\.\s*register|navigator\.serviceWorker/)).toEqual([]);
  });

  it("ships no service-worker file to be registered", () => {
    for (const stray of ["public/sw.js", "public/service-worker.js", "public/workbox-sw.js"]) {
      expect(() => statSync(path.resolve(repoRoot, stray))).toThrow();
    }
  });

  it("depends on no PWA caching library", () => {
    const allDependencies = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });
    const banned = allDependencies.filter((name) =>
      /^(next-pwa|@ducanh2912\/next-pwa|workbox-|@serwist\/|serwist)/.test(name)
    );

    expect(banned).toEqual([]);
  });
});

describe("PWA install prompt inertness", () => {
  const setFlag = (value: string | undefined): void => {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED;
      return;
    }
    process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED = value;
  };

  it("resolves false when the flag is unset, empty, or explicitly off", async () => {
    const { isInstallPromptEnabled } = await import("@/lib/pwa");
    const original = process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED;

    try {
      for (const value of [undefined, "", "false", "0", "off", "no"]) {
        setFlag(value);
        expect(isInstallPromptEnabled()).toBe(false);
      }
      for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
        setFlag(value);
        expect(isInstallPromptEnabled()).toBe(true);
      }
    } finally {
      setFlag(original);
    }
  });

  it("is read through exactly one resolver, so the flag has a single indirection point", () => {
    // Same reversible convention as NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED /
    // NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM: one reader, so flipping the flag
    // is provably all-or-nothing.
    expect(filesMatching(/process\.env\.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED/)).toEqual([
      "lib/pwa.ts",
    ]);
  });

  it("registers no beforeinstallprompt listener while the flag is off", () => {
    // Asserted structurally rather than by rendering: the vitest environment is
    // `node` (no DOM), and a headless DOM could not host a real install prompt
    // anyway. The contract is that the flag check short-circuits the effect
    // BEFORE any listener is attached, so an off flag costs zero listeners.
    const effect = sourceBetween(
      pwaLibSource,
      "export function usePwaInstallPrompt()",
      "const promptInstall = useCallback("
    );
    const guardIndex = effect.indexOf("if (!isInstallPromptEnabled() || isRunningAsInstalledPwa()) {");
    const firstListenerIndex = effect.indexOf("window.addEventListener(");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(firstListenerIndex).toBeGreaterThan(guardIndex);
    expect(effect.slice(guardIndex, firstListenerIndex)).toContain("return;");

    // `canInstallOnDevice` is derived purely from the deferred event, which the
    // guarded effect is the only writer of — so an off flag pins it false.
    expect(pwaLibSource).toContain("canInstallOnDevice: deferredEvent !== null");
  });

  it("renders no install UI while the flag is off", () => {
    // Both install surfaces live in one slot in the Bingo landscape headline
    // (Phase 5). The Android button is gated on `canInstallOnDevice`, pinned
    // false above; the iOS coach card is gated on `showInstallCoachCard`, whose
    // only enabling effect bails on the same flag.
    const coachCardEffect = sourceBetween(
      bingoSource,
      "      !isInstallPromptEnabled() ||",
      "setShowInstallCoachCard(true);"
    );
    expect(coachCardEffect).toContain("setShowInstallCoachCard(false);");
    expect(coachCardEffect).toContain("return;");

    expect(bingoSource).toContain("{canInstallOnDevice ? (");
    expect(bingoSource).toContain("showInstallCoachCard ? (");

    // Players only (master plan §2): no install promotion on partner/admin
    // surfaces, and no global banner. This component is the only host.
    expect(filesMatching(/usePwaInstallPrompt|isInstallPromptEnabled/)).toEqual(
      expect.arrayContaining(["lib/pwa.ts", "components/bingo/SportsBingoHome.tsx"])
    );
    expect(filesMatching(/usePwaInstallPrompt|isInstallPromptEnabled/)).toHaveLength(2);
  });

  it("keeps the flag documented as off in .env.example", () => {
    // .env.local is off limits (CLAUDE.md); .env.example is the checked-in
    // record and must never ship the flag pre-flipped.
    expect(read(".env.example")).toContain("NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED=false");
  });
});

describe("Bingo landscape CSS stays out of portrait", () => {
  // Precedent this guard exists for: commit 35115fc leaked a `100svh` clamp
  // from Category Blitz onto five other game routes
  // (docs/mobile-game-screen-blackout-plan.md). Phase 1 of this plan added a
  // comparable pile of viewport/overflow CSS; it must reach ONLY the landscape
  // shell, which is mounted only while `isLandscapeGameView` is true.

  type CssRule = { selector: string; body: string; media: string | null };

  function parseTopLevelRules(css: string): CssRule[] {
    const rules: CssRule[] = [];

    const parseBlock = (source: string, media: string | null): void => {
      let index = 0;
      while (index < source.length) {
        const braceIndex = source.indexOf("{", index);
        if (braceIndex === -1) {
          return;
        }
        // Find the matching close brace for this block.
        let depth = 1;
        let cursor = braceIndex + 1;
        while (cursor < source.length && depth > 0) {
          if (source[cursor] === "{") depth += 1;
          if (source[cursor] === "}") depth -= 1;
          cursor += 1;
        }
        const prelude = source
          .slice(index, braceIndex)
          // Strip comments so a selector mentioned in prose isn't parsed as one.
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim();
        const body = source.slice(braceIndex + 1, cursor - 1);

        if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
          parseBlock(body, prelude);
        } else if (prelude.startsWith("@")) {
          // @keyframes / @layer etc. — not selector rules, skip.
        } else if (prelude.length > 0) {
          rules.push({ selector: prelude, body, media });
        }

        index = cursor;
      }
    };

    parseBlock(css, null);
    return rules;
  }

  const rules = parseTopLevelRules(globalsSource);

  it("scopes every landscape rule to the landscape shell or the landscape body class", () => {
    const landscapeRules = rules.filter(
      (rule) => rule.selector.includes("tp-bingo-landscape") || rule.body.includes("--bingo-landscape")
    );

    // Sanity: the parser actually found Phase 1's CSS.
    expect(landscapeRules.length).toBeGreaterThan(10);

    const unscoped = landscapeRules
      .filter((rule) =>
        rule.selector
          .split(",")
          .map((part) => part.trim())
          .some((part) => !part.includes("tp-bingo-landscape"))
      )
      .map((rule) => rule.selector);

    expect(unscoped).toEqual([]);
  });

  it("gates every landscape media query on landscape orientation or standalone display", () => {
    // A landscape tuning block that forgot `(orientation: landscape)` would
    // fire on a portrait phone the moment any other rule mounted the class —
    // and `max-height: 430px` / `max-width: 700px` alone match portrait phones.
    const mediaScoped = rules.filter(
      (rule) =>
        rule.media !== null &&
        (rule.selector.includes("tp-bingo-landscape") || rule.body.includes("--bingo-landscape"))
    );

    expect(mediaScoped.length).toBeGreaterThan(0);
    for (const rule of mediaScoped) {
      expect(rule.media).toMatch(/orientation:\s*landscape|display-mode:/);
    }
  });

  it("never applies the landscape body lock or chrome suppression without the toggled class", () => {
    // `overflow/touch-action: none !important` on html/body is the strongest CSS
    // in this feature and outranks ScrollRescueGuard's inline recovery (Phase 0
    // tripwire). It must be reachable only through the class SportsBingoHome
    // toggles, and only while the landscape board is up.
    const bodyLock = rules.filter(
      (rule) =>
        rule.body.includes("touch-action: none !important") &&
        rule.selector.includes("tp-bingo-landscape")
    );
    expect(bodyLock).toHaveLength(1);
    expect(bodyLock[0]?.selector).toBe(
      "html.tp-bingo-landscape-active,\nbody.tp-bingo-landscape-active"
    );

    // Ad + shell-padding suppression is CSS-only and equally class-scoped, so
    // nothing outside landscape can hide the adhesion ad or zero the padding.
    for (const selector of [
      "html.tp-bingo-landscape-active .tp-mobile-adhesion-ad",
      "html.tp-bingo-landscape-active .tp-app-shell > main",
    ]) {
      expect(rules.some((rule) => rule.selector === selector)).toBe(true);
    }

    // The class is added and removed strictly with `isLandscapeGameView`, and
    // cleaned up on unmount — otherwise a player who navigates away mid-rotation
    // keeps a locked, ad-less document.
    expect(bingoSource).toContain(
      'document.documentElement.classList.toggle("tp-bingo-landscape-active", isLandscapeGameView);'
    );
    expect(bingoSource).toContain(
      'document.body.classList.toggle("tp-bingo-landscape-active", isLandscapeGameView);'
    );
    expect(bingoSource).toContain(
      'document.documentElement.classList.remove("tp-bingo-landscape-active");'
    );
    expect(bingoSource).toContain('document.body.classList.remove("tp-bingo-landscape-active");');
  });

  it("keeps portrait square labels on the original truncation budget", () => {
    // Phase 1 raised the label cap for the big landscape squares only. Portrait
    // squares are far smaller; the same cap there overflows them.
    expect(bingoSource).toContain("function shortenLabel(label: string, maxLength = 18): string {");
    expect(bingoSource).toContain("{isFree ? \"FREE\" : shortenLabel(square.label)}");

    const landscapeCapUses = bingoSource.match(/LANDSCAPE_SQUARE_LABEL_MAX_LENGTH/g) ?? [];
    // Exactly two: the declaration and the single landscape render site.
    expect(landscapeCapUses).toHaveLength(2);
  });

  it("adds no Bingo-specific viewport clamp to the shared app shell", () => {
    // The 35115fc failure mode precisely: a per-game clamp landing in shared
    // shell code and applying to every game route. This feature's chrome
    // suppression is entirely CSS keyed on the landscape class, so the shell
    // itself must know nothing about Bingo landscape.
    const appShellSource = read("components/ui/AppShell.tsx");
    expect(appShellSource).not.toContain("tp-bingo-landscape");

    // MobileAdhesionAd is the one shared-chrome exception, and only in one direction:
    // it must *read* the landscape flag so it can unmount, because AdBanner POSTs an
    // impression from a mount effect and `display: none` would still bill the advertiser
    // for a banner no player can see. Read-only classList check, nothing else — no
    // landscape sizing token, no landscape class ever written or rendered here.
    const adhesionSource = read("components/ui/MobileAdhesionAd.tsx");
    expect(adhesionSource).not.toContain("--bingo-landscape");
    expect(adhesionSource).toContain(
      'document.documentElement.classList.contains("tp-bingo-landscape-active")'
    );
    const landscapeMentions = new Set(adhesionSource.match(/tp-bingo-landscape[\w-]*/g) ?? []);
    expect([...landscapeMentions]).toEqual(["tp-bingo-landscape-active"]);
  });

  it("keeps the standalone safe-area padding scoped to installed launches", () => {
    // Phase 4's insets exist because a standalone window draws under the iOS
    // status bar and home indicator. In a browser tab those strips belong to
    // Safari, so unscoped padding would be dead space for every non-installed
    // player — i.e. most of them.
    const safeAreaRules = rules.filter((rule) => rule.selector.includes("tp-app-shell-safe-area"));

    expect(safeAreaRules.length).toBeGreaterThan(0);
    for (const rule of safeAreaRules) {
      expect(rule.selector).toContain("html.tp-standalone");
    }
  });
});
