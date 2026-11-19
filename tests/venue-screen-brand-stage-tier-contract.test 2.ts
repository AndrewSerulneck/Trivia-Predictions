import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phase 6 (2026-11-12): at 4K under a ×6 CPU throttle the drifting BrandStage washes cost a static game screen
// ~33 ms per frame (24 fps vs 115 without them). When the frame watchdog drops the fx tier to `off`, they stop.

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("BrandStage follows the effects quality tier", () => {
  it("stops drifting when the tier is off, as under reduced motion", () => {
    const src = read("components/venue-screen/fx/BrandStage.tsx");
    expect(src).toMatch(/const tier = useFxTier\(\);/);
    expect(src).toMatch(/const still = Boolean\(reduceMotion\) \|\| tier === "off";/);
    expect(src.match(/animate=\{still \? STILL :/g)).toHaveLength(2);
  });

  it("the engine notifies tier changes and useFxTier is hydration-safe", () => {
    const engine = read("components/venue-screen/fx/fxEngine.ts");
    expect(engine).toMatch(/tier = next;\s*notifyTier\(\);/);
    expect(engine).toMatch(/subscribeTier: \(listener\) =>/);
    const hook = read("components/venue-screen/fx/useFx.ts");
    expect(hook).toMatch(/useSyncExternalStore\(engine \? engine\.subscribeTier : subscribeNothing, engine \? engine\.tier : fullTier, fullTier\)/);
  });
});
