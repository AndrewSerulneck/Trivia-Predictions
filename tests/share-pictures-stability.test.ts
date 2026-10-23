// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { buildLiveTriviaStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

// Native-app plan Phase 9f.3: R5 a payload that is "equal but new" must not restart the pictures,
// R6 thumbnails never point at a released picture, R7 a closed share button does no work.

const mocks = vi.hoisted(() => ({
  renderDesign: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  readShareVenue: vi.fn((): null => null),
  fetchVenueById: vi.fn(async (): Promise<{ ok: false }> => ({ ok: false })),
  getUserId: vi.fn((): string | null => "user-1"),
  getUsername: vi.fn((): string | null => "ace"),
  getVenueId: vi.fn((): string | null => "venue-1"),
}));

vi.mock("@/lib/socialShare/platform/webStoryPlatform", () => ({
  webStoryPlatform: {
    renderDesign: mocks.renderDesign,
    createShareFile: ({ blob }: { blob: Blob }) => blob,
    canShareFile: () => true,
    shareImage: async () => ({ status: "shared" as const, fallbackRecommended: false }),
    saveImage: () => ({ status: "saved" as const }),
    detectCapabilities: () => ({ hasMediaDevices: false }),
    getCameraPermissionState: async () => "prompt",
  },
}));
vi.mock("@/lib/socialShare/shareVenue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/socialShare/shareVenue")>()),
  readShareVenue: mocks.readShareVenue,
}));
vi.mock("@/lib/venues", () => ({ fetchVenueById: mocks.fetchVenueById }));
vi.mock("@/lib/storage", () => ({
  getUserId: mocks.getUserId,
  getUsername: mocks.getUsername,
  getVenueId: mocks.getVenueId,
}));
vi.mock("@/lib/nativeApp", () => ({ isNativeApp: () => false, openInSystemBrowser: async () => true }));
vi.mock("@/lib/nativeInstagramStories", () => ({
  canShareToInstagramStory: async () => false,
  shareToInstagramStory: async () => "unavailable",
}));
vi.mock("@/lib/nativeImageShare", () => ({ canShareImageNatively: () => false }));
vi.mock("@/lib/copyText", () => ({ copyText: async () => true }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/scrollLock", () => ({ setScrollLock: vi.fn() }));
vi.mock("@/components/navigation/nativeBackButton", () => ({ useNativeBackHandler: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  createStoryShareAnalyticsId: () => "share-1",
  trackStoryCameraPermissionResult: vi.fn(),
  trackStoryCaptureCompleted: vi.fn(),
  trackStoryShareAttempted: vi.fn(),
  trackStoryShareCompleted: vi.fn(),
  trackStoryShareFallbackUsed: vi.fn(),
  trackStoryShareOpened: vi.fn(),
}));

const { StoryShareLauncher } = await import("@/components/social-share/StoryShareLauncher");
const { ShareWinButton } = await import("@/components/social-share/ShareWinButton");
const { useSharePictures } = await import("@/components/social-share/useSharePictures");
const { useShareVenue } = await import("@/components/social-share/useShareVenue");

const root = path.resolve(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

const payloadAt = (achievedAtIso: string) =>
  buildLiveTriviaStorySharePayload({
    venueId: "venue-1",
    venueName: "The High Top",
    userId: "user-1",
    username: "ace",
    finalRank: 1,
    finalPoints: 120,
    correctRate: 80,
    achievedAtIso,
  });

let objectUrlCount = 0;
let revoked: Set<string>;

beforeEach(() => {
  objectUrlCount = 0;
  revoked = new Set();
  mocks.renderDesign.mockClear();
  mocks.readShareVenue.mockClear();
  mocks.fetchVenueById.mockClear();
  mocks.getUserId.mockReset();
  mocks.getUserId.mockReturnValue("user-1");
  mocks.getUsername.mockClear();
  mocks.getVenueId.mockClear();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => `blob:picture-${(objectUrlCount += 1)}`,
      revokeObjectURL: (url: string) => revoked.add(url),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

describe("R5 — an equal-but-new payload does not restart the pictures", () => {
  it("re-rendering the open launcher with a new achievedAtIso draws nothing again", async () => {
    const { rerender } = render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await settle();
    const drawn = mocks.renderDesign.mock.calls.length;
    expect(drawn).toBeGreaterThan(0);

    rerender(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:07.000Z") }));
    rerender(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:09.000Z") }));
    await settle();
    expect(mocks.renderDesign.mock.calls.length).toBe(drawn);
  });

  it("a real change (new score) does redraw", async () => {
    const { rerender } = render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await settle();
    const drawn = mocks.renderDesign.mock.calls.length;
    rerender(createElement(StoryShareLauncher, { payload: { ...payloadAt("2026-10-22T10:00:00.000Z"), finalPoints: 999 } }));
    await settle();
    expect(mocks.renderDesign.mock.calls.length).toBeGreaterThan(drawn);
  });

  it("Category Blitz's finish screen builds its payload once per set of inputs", () => {
    const source = read("components/category-blitz/CategoryBlitzGame.tsx");
    expect(source).toMatch(/useMemo\(\s*\(\) =>[\s\S]{0,400}buildCategoryBlitzStorySharePayload/);
  });
});

describe("R6 — a thumbnail never points at a released picture", () => {
  it("active → inactive → active returns no URL from the first run", async () => {
    const story = prepareStorySharePayload(payloadAt("2026-10-22T10:00:00.000Z"));
    const { result, rerender } = renderHook(({ active }) => useSharePictures(story, "story", "spotlight", active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(Object.keys(result.current.pictures).length).toBeGreaterThan(0));
    const firstRun = Object.values(result.current.pictures).map((picture) => picture!.url);

    rerender({ active: false });
    expect(result.current.pictures).toEqual({});
    rerender({ active: true });
    // Straight after coming back, before any new picture lands: nothing stale.
    for (const picture of Object.values(result.current.pictures)) expect(revoked.has(picture!.url)).toBe(false);
    expect(Object.values(result.current.pictures).map((picture) => picture!.url)).not.toEqual(expect.arrayContaining(firstRun));

    await waitFor(() => expect(Object.keys(result.current.pictures).length).toBeGreaterThan(0));
    for (const picture of Object.values(result.current.pictures)) expect(revoked.has(picture!.url)).toBe(false);
  });
});

describe("R7 — a closed share button does no work", () => {
  it("a closed launcher renders no sheet and draws nothing", async () => {
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    await settle();
    expect(screen.queryByRole("button", { name: "Facebook" })).toBeNull();
    expect(mocks.renderDesign).not.toHaveBeenCalled();
    expect(mocks.readShareVenue).not.toHaveBeenCalled();
  });

  it("opening it mounts the sheet; closing unmounts it again", async () => {
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" })).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Facebook" })).toBeNull());
  });

  it("useShareVenue reads storage only while the sheet is active", () => {
    const { rerender } = renderHook(({ active }) => useShareVenue("venue-1", active), { initialProps: { active: false } });
    expect(mocks.readShareVenue).not.toHaveBeenCalled();
    rerender({ active: true });
    expect(mocks.readShareVenue).toHaveBeenCalledTimes(1);
  });

  it("ShareWinButton reads the player's storage once, however often it re-renders", () => {
    const props = { gameType: "bingo" as const, result: { finalRank: 1 } };
    const { rerender } = render(createElement(ShareWinButton, props));
    expect(screen.getByRole("button", { name: "Share my win" })).toBeTruthy();
    const reads = mocks.getUserId.mock.calls.length;
    for (let i = 0; i < 5; i += 1) rerender(createElement(ShareWinButton, { ...props, result: { finalRank: 1 } }));
    expect(mocks.getUserId.mock.calls.length).toBe(reads);
    expect(reads).toBeLessThanOrEqual(2);
  });

  it("ShareWinButton shows nothing with no signed-in player", () => {
    mocks.getUserId.mockReturnValue(null);
    render(createElement(ShareWinButton, { gameType: "bingo", result: { finalRank: 1 } }));
    expect(screen.queryByRole("button", { name: "Share my win" })).toBeNull();
  });
});

describe("9f.4 — a deep-link share waits for the venue read", () => {
  const venueRow = {
    id: "venue-1",
    name: "hightop",
    displayName: "The High Top",
    latitude: 1,
    longitude: 1,
    radius: 100,
    shareShowName: false,
  };

  it("pictures draw, but no destination or caption copy runs until the read settles; one read per open", async () => {
    let finish: (value: { ok: true; venue: typeof venueRow }) => void = () => {};
    mocks.fetchVenueById.mockImplementationOnce(
      () => new Promise((resolve) => { finish = resolve as typeof finish; }) as never,
    );
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await settle();

    expect(mocks.renderDesign).toHaveBeenCalled();
    expect(mocks.fetchVenueById).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Getting your picture ready…")).toBeTruthy();
    for (const label of ["Facebook", "Messages", "More", "Copy caption + link"]) {
      expect(screen.getByRole("button", { name: label }).hasAttribute("disabled"), label).toBe(true);
    }
    // While waiting the caption names no bar (nothing fresh is known), never the screen's own name.
    expect(screen.queryByText(/The High Top/)).toBeNull();

    await act(async () => finish({ ok: true, venue: venueRow }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByText("Getting your picture ready…")).toBeNull();
    // The partner turned the name off: still no bar name after the read.
    expect(screen.queryByText(/The High Top/)).toBeNull();
    expect(mocks.fetchVenueById).toHaveBeenCalledTimes(1);
  });

  it("a fresh remembered venue: no read, ready at once", async () => {
    mocks.readShareVenue.mockReturnValueOnce({
      fresh: true,
      venue: { id: "venue-1", name: "The High Top", address: null, instagram: null, show: { name: true, address: true, instagram: true } },
    } as never);
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
    expect(mocks.fetchVenueById).not.toHaveBeenCalled();
    // The positive control for the "no bar" checks above and below.
    expect(screen.getAllByText(/The High Top/).length).toBeGreaterThan(0);
  });

  it("a failed read with nothing remembered: shares with no bar", async () => {
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByText(/The High Top/)).toBeNull();
  });
});
