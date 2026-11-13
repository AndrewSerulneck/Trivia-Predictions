import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Venue display panels are server-rendered. framer's useReducedMotion() is already true on the client's first render
// but the server renders "no preference", so `{!reduceMotion && <el/>}` breaks hydration (React #418) on every
// reduced-motion TV. Element-existence gates use useReducedMotionAfterHydration() instead (Phase 6, 2026-11-12).

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const SSR_PANELS = [
  "components/venue-screen/TvQuestionReveal.tsx",
  "components/venue-screen/TvAnswerReveal.tsx",
  "components/venue-screen/TvRoundBreak.tsx",
  "components/venue-screen/TvFinalStandings.tsx",
  "components/venue-screen/TvBlitzResults.tsx",
];

describe("venue display reduced motion is hydration-safe", () => {
  it("server-rendered panels never gate an element on framer's useReducedMotion()", () => {
    for (const file of SSR_PANELS) {
      const src = read(file);
      expect(src, file).not.toMatch(/\{!reduceMotion &&/);
      expect(src, file).not.toMatch(/\{!(skipHandoff|settled|settleImmediately) &&/);
      expect(src, file).toMatch(/useReducedMotionAfterHydration\(\)/);
    }
  });

  it("the hook renders 'no preference' on the server and while hydrating", () => {
    const hook = read("components/venue-screen/fx/useReducedMotionAfterHydration.ts");
    expect(hook).toMatch(/useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/);
    expect(hook).toMatch(/const getServerSnapshot = \(\) => false;/);
  });
});
