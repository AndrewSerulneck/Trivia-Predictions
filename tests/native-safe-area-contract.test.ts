import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Tripwire for docs/native-app-store-plan.md Phase 2D (R1/R2: content under the
// iPhone status bar, and the venue-home gap). Asserted without a device, on
// purpose: what the phone actually draws is Andrew's device checklist. What CAN
// be pinned is the set of choices that, if quietly reverted, put the Back and
// menu buttons back under the status bar:
//
//  1. The shell starts the iPhone web view BELOW the status bar (StatusBar
//     overlaysWebView false) instead of drawing the page under it, and both
//     platforms draw light status-bar icons on the site's dark navy.
//  2. A safe-area top padding never sits on a <section>/<article>: globals.css
//     pads every `.tp-page-main section, .tp-page-main article` with
//     `0.625rem !important` on phones, which silently replaces it. That is what
//     hid the venue-home menu and alerts buttons in the app.
//  3. The venue home sizes the space under its fixed header from the header's
//     measured height, not a guessed "inset + 8rem".

const repoRoot = process.cwd();
const read = (relativePath: string): string => readFileSync(path.resolve(repoRoot, relativePath), "utf8");

type CapacitorConfig = {
  ios?: { contentInset?: string };
  plugins?: {
    StatusBar?: { overlaysWebView?: boolean; style?: string; backgroundColor?: string };
    SystemBars?: { style?: string };
  };
};

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(path.resolve(repoRoot, dir))) {
    const rel = path.join(dir, entry);
    const stat = statSync(path.resolve(repoRoot, rel));
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      out.push(...listSourceFiles(rel));
    } else if (/\.tsx$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
};

describe("Native shell keeps the page out from under the status bar (Phase 2D)", () => {
  const config = JSON.parse(read("native/capacitor.config.json")) as CapacitorConfig;

  it("iOS starts the web view below the status bar, on dark navy, with light icons", () => {
    expect(config.plugins?.StatusBar?.overlaysWebView).toBe(false);
    expect(config.plugins?.StatusBar?.backgroundColor?.toLowerCase()).toBe("#020617");
    // Capacitor's names describe the BACKGROUND: "DARK" = light text for a dark bar.
    expect(config.plugins?.StatusBar?.style).toBe("DARK");
    expect(config.plugins?.SystemBars?.style).toBe("DARK");
  });

  it("the status-bar plugin is installed in the shell", () => {
    const nativePackage = JSON.parse(read("native/package.json")) as { dependencies: Record<string, string> };
    expect(nativePackage.dependencies["@capacitor/status-bar"]).toBeTruthy();
  });

  it("Android paints the edge-to-edge strip dark navy instead of the default white", () => {
    const styles = read("native/android/app/src/main/res/values/styles.xml");
    expect(styles).toContain('<item name="android:windowBackground">@color/htc_canvas</item>');
    expect(read("native/android/app/src/main/res/values/htc_colors.xml")).toContain(
      '<color name="htc_canvas">#020617</color>',
    );
  });
});

describe("Safe-area top padding is never overridden by the phone section rule", () => {
  it("globals.css still has the rule this guards against (update this test if it is removed)", () => {
    expect(read("app/globals.css")).toMatch(/\.tp-page-main section,\s*\.tp-page-main article\s*\{\s*padding: 0\.625rem !important;/);
  });

  it("no <section> or <article> carries safe-area-inset-top padding", () => {
    const offenders: string[] = [];
    for (const file of [...listSourceFiles("components"), ...listSourceFiles("app")]) {
      if (file.startsWith(path.join("components", "venue-screen"))) continue; // TV display, not in .tp-page-main
      const source = read(file);
      const tags = source.match(/<(section|article)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (/safe-area-inset-top/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Venue home header (R1/R2)", () => {
  const header = read("components/venue/VenueHubHeaderBar.tsx");
  const hub = read("components/venue/VenueHubClient.tsx");

  it("the fixed header is a <header> that pays the safe-area inset on phones too", () => {
    expect(header).toMatch(/<header\s+ref=\{headerRef\}/);
    expect(header).toContain("max-[430px]:pt-[max(env(safe-area-inset-top),0.625rem)]");
  });

  it("the spacer under it uses the header's measured height", () => {
    expect(header).toContain("new ResizeObserver(sync)");
    expect(header).toContain('spacer.style.setProperty("--venue-hub-header-h"');
    expect(header).toContain("h-[var(--venue-hub-header-h,");
    expect(hub).not.toContain("+8rem)]");
  });
});
