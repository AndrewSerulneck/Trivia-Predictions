import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const joinFlowSource = readFileSync(
  path.resolve(process.cwd(), "components/join/JoinFlow.tsx"),
  "utf8"
);
const venuePresenceBoundarySource = readFileSync(
  path.resolve(process.cwd(), "components/venue/VenuePresenceBoundary.tsx"),
  "utf8"
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("God Mode join contract static guard", () => {
  it("keeps account-backed venue selection server-first", () => {
    const accountBranch = sourceBetween(
      joinFlowSource,
      "const resolvedAccountId = accountId || getAccountId();",
      "const sessionUserId = (getUserId() ?? \"\").trim();"
    );

    expect(accountBranch).toContain("void resolveAndNavigate(resolvedAccountId, selectedVenue);");
    expect(accountBranch).not.toContain("verifyVenueAccess(");
  });

  it("keeps stored-session venue selection server-first", () => {
    const sessionBranch = sourceBetween(
      joinFlowSource,
      "const sessionUserId = (getUserId() ?? \"\").trim();",
      "// Legacy path (no accountId): show username/PIN login for this venue."
    );

    expect(sessionBranch).toContain("void resolveAndNavigateFromSession(sessionUserId, selectedVenue);");
    expect(sessionBranch).not.toContain("verifyVenueAccess(");
  });

  it("does not run browser geolocation on a direct venue link before auth", () => {
    const directVenueLoadBranch = sourceBetween(
      joinFlowSource,
      "const venues = await listVenues();",
      "} catch (error) {"
    );

    expect(directVenueLoadBranch).toContain("setActivePanel(\"auth-method-selection\");");
    expect(directVenueLoadBranch).not.toContain("checkPermissionState(");
    expect(directVenueLoadBranch).not.toContain("getCurrentLocation(");
    expect(directVenueLoadBranch).not.toContain("getBestCurrentLocation(");
  });

  it("tries global account auth before the legacy venue PIN location gate", () => {
    const pinSubmitBeforeLocationGate = sourceBetween(
      joinFlowSource,
      "async function createProfile(pinOverride?: string) {",
      "if (!(DISABLE_GEOFENCE_FOR_TESTING || godMode) && !locationVerified)"
    );

    expect(pinSubmitBeforeLocationGate).toContain("createOrLoginAccount({");
    expect(pinSubmitBeforeLocationGate).toContain("await resolveAndNavigate(account.id, venue);");
  });

  it("preserves the God Mode client flag across venue navigation", () => {
    const navigationHelper = sourceBetween(
      joinFlowSource,
      "const navigateToResolvedVenue = useCallback(",
      "const resolveAndNavigate = useCallback("
    );

    expect(navigationHelper).toContain("const preserveGodMode = getGodMode();");
    expect(navigationHelper).toContain("if (preserveGodMode) {");
    expect(navigationHelper).toContain("saveGodMode(true);");
  });

  it("lets the server apply God Mode presence bypass when browser location fails", () => {
    expect(venuePresenceBoundarySource).toContain("const serverAllowed = await sendHeartbeat(null");
    expect(venuePresenceBoundarySource).toContain("await sendHeartbeat(null);");
  });
});
