import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Venue Location page tripwire (docs/signup-price-copy-and-partner-geofence-plan.md Phase 3).
const page = readFileSync(join(__dirname, "..", "app/owner/venue-location/page.tsx"), "utf8");

describe("owner venue location page", () => {
  it("mounts the shared GeofenceEditor locked, with the owner maps key and the signup radius range", () => {
    expect(page).toContain("<GeofenceEditor");
    expect(page).toContain("startLocked");
    expect(page).toContain('lockedView="map"');
    expect(page).toContain("ht-light-surface");
    expect(page).not.toContain("COPY.helper");
    expect(page).not.toContain("COPY.pageSubtitle");
    expect(page).toContain("flushHeader");
    expect(page).toContain("hideAdvanced");
    expect(page).toContain('mapsKeyEndpoint="/api/owner/maps-key"');
    expect(page).toMatch(/min=\{SIGNUP_RADIUS_MIN\}/);
    expect(page).toMatch(/max=\{SIGNUP_RADIUS_MAX\}/);
  });

  it("changes the radius only through onRadiusChange, never from a pin move's echo (D7, Phase 5)", () => {
    expect(page).toContain("onRadiusChange={handleRadiusChange}");
    const editorChange = page.match(/const handleEditorChange = useCallback\(([\s\S]*?)\n  \);/);
    expect(editorChange).not.toBeNull();
    expect(editorChange?.[1]).not.toContain("setRadius");
    expect(page).not.toContain("shownRadius");
    expect(page).toContain("radius={radius ?? SIGNUP_RADIUS_DEFAULT}");
  });

  it("recovers a 401 through ownerAuthRecoveryPath, never a bare /owner/login push", () => {
    expect(page).toContain("ownerAuthRecoveryPath(");
    expect(page).not.toMatch(/router\.push\("\/owner\/login/);
  });

  it("load, save and venue switch are safe (Phase 6: R2, R3, R9)", () => {
    expect(page).toContain("!res.ok");
    expect(page).toContain("venuesReloadKey");
    expect(page).toContain("COPY.venuesLoadFailed");
    expect(page).toContain("disabled={saving}");
    expect(page).toContain("selectedVenueIdRef.current !== venueId");
    expect(page).toContain("onChange={handleVenueChange}");
    expect(page).toContain("window.confirm(COPY.discardChanges)");
    expect(page).not.toMatch(/setInterval|setTimeout/);
  });

  it("uses the shared pin rule, not a hand-rolled null check (Phase 7: R4)", () => {
    expect(page).toContain("isUsableVenuePin");
    expect(page).not.toMatch(/saved\.latitude !== null/);
  });
});
