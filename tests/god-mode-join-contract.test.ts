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
      "// Direct venue link (pre-auth): warm the venue cache only.",
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

// Phase 2C (docs/native-app-store-plan.md, device report R4): a player who is
// not God Mode must never see a venue outside their range — not for a moment,
// and not after a God Mode account used the same phone.
describe("Venue-list leak guard (Phase 2C)", () => {
  it("renders only the generation-checked list, and never sets the raw list directly", () => {
    expect(joinFlowSource).toContain("const venueList = visibleJoinVenueList(venueListState);");
    expect(joinFlowSource).not.toMatch(/\bsetVenueList\(/);
    // The only writers of the list state: the empty reset and the guarded commit.
    const writers = joinFlowSource.match(/setVenueListState\(/g) ?? [];
    expect(writers).toHaveLength(2);
    expect(joinFlowSource).toContain("setVenueListState(emptyJoinVenueList(generation));");
    expect(joinFlowSource).toContain(
      "setVenueListState((current) => commitJoinVenueList(current, generation, venues));"
    );
  });

  it("drops the old list everywhere the builder guard is reset", () => {
    // Exactly one `venueListBuiltRef.current = false`, inside discardVenueList,
    // which also empties the list. Sign-out and back-to-sign-in both call it.
    const resets = joinFlowSource.match(/venueListBuiltRef\.current = false/g) ?? [];
    expect(resets).toHaveLength(1);
    const discard = sourceBetween(
      joinFlowSource,
      "const discardVenueList = useCallback(() => {",
      "}, [beginVenueListBuild]);"
    );
    expect(discard).toContain("venueListBuiltRef.current = false;");
    expect(discard).toContain("beginVenueListBuild();");

    const signedOut = sourceBetween(
      joinFlowSource,
      "const handleSignedOut = useCallback(() => {",
      "}, [refreshAuthSession, discardVenueList]);"
    );
    expect(signedOut).toContain("discardVenueList();");

    const backToAuth = sourceBetween(
      joinFlowSource,
      "const handleBackToAuthMethodSelection = useCallback(() => {",
      "}, [discardVenueList]);"
    );
    expect(backToAuth).toContain("discardVenueList();");
  });

  it("empties the list before the builder awaits anything, and drops a stale build", () => {
    const builder = sourceBetween(
      joinFlowSource,
      "const buildVenueListAfterAuth = useCallback(async () => {",
      "}, [beginVenueListBuild, commitVenueList]);"
    );
    const begin = builder.indexOf("const generation = beginVenueListBuild();");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(builder.indexOf("await "));
    expect(builder).toContain("if (!isCurrentBuild()) return;");
    expect(builder).toContain("commitVenueList(generation, nearbyVenues);");
    expect(builder).toContain("const nearbyVenues = filterVenuesInRange(venues, coords);");
  });

  it("starts a fresh build for a venue-list location retry", () => {
    const retry = sourceBetween(
      joinFlowSource,
      "const handleGrantLocation = useCallback(async (intent",
      "}, [venue, beginVenueListBuild, commitVenueList]);"
    );
    const begin = retry.indexOf('const listGeneration = intent === "venue-list" ? beginVenueListBuild() : null;');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(retry.indexOf("await "));
    expect(retry).toContain("if (isStaleListRetry()) return;");
  });

  it("never fills the list from the direct-venue-link load path", () => {
    const directVenueLoadBranch = sourceBetween(
      joinFlowSource,
      "// Direct venue link (pre-auth): warm the venue cache only.",
      "} catch (error) {"
    );
    expect(directVenueLoadBranch).toContain("await listVenues();");
    expect(directVenueLoadBranch).not.toContain("commitVenueList(");
    expect(directVenueLoadBranch).not.toContain("setVenueListState(");
  });
});

describe("Venue-list QR scan (R2)", () => {
  const scanHandler = () =>
    sourceBetween(joinFlowSource, "const handleVenueListQrScanned = useCallback(", "const handleBackToVenueList");

  it("selects through the same handleSelectVenue a tap uses, with no URL push", () => {
    const handler = scanHandler();
    expect(handler).toContain("decideScannedVenue(scannedVenueId, venueListState, await listVenues())");
    expect(handler).toContain("handleSelectVenue(decision.venue)");
    expect(handler).not.toMatch(/router\.(push|replace)|location\.(assign|href)/);
  });

  it("never re-checks location or resets the list", () => {
    const handler = scanHandler();
    expect(handler).not.toMatch(/getInitialLocation|getBestCurrentLocation|geolocation|queryLocationPermission/);
    expect(handler).not.toMatch(/venueListBuiltRef|discardVenueList|beginVenueListBuild|commitVenueList|setVenueListState/);
  });

  it("is the venue-list panel's scan handler; the pre-sign-in button keeps the deep link", () => {
    expect(joinFlowSource).toContain("onVenueScanned={handleVenueListQrScanned}");
    expect(joinFlowSource.match(/onVenueScanned=\{handleVenueQrScanned\}/g)?.length).toBe(1);
    expect(joinFlowSource).toContain("const handleVenueQrScanned = useCallback((_venueId: string, path: string) => router.push(path), [router]);");
  });
});
