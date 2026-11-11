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
  canMakeVideo: vi.fn(async () => false),
  encodeVideo: vi.fn(async (_input: unknown, _options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) =>
    new Blob(["mp4"], { type: "video/mp4" })),
  shareImage: vi.fn(async (_request: { blob: Blob; fileName?: string }) => ({ status: "shared" as const, fallbackRecommended: false })),
  isNativeApp: vi.fn(() => false),
  instagramSupport: vi.fn(async () => ({ picture: false, video: false })),
  shareToInstagramStory: vi.fn(async (_media: Blob, _options?: { caption?: string; fileName?: string }): Promise<"opened" | "unavailable" | "failed"> => "unavailable"),
}));

vi.mock("@/lib/socialShare/platform/webStoryPlatform", () => ({
  webStoryPlatform: {
    renderDesign: mocks.renderDesign,
    createShareFile: ({ blob }: { blob: Blob }) => blob,
    canShareFile: () => true,
    shareImage: mocks.shareImage,
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
vi.mock("@/lib/socialShare/celebrationVideo", () => ({
  canMakeCelebrationVideo: mocks.canMakeVideo,
  encodeCelebrationVideo: mocks.encodeVideo,
}));
vi.mock("@/lib/storage", () => ({
  getUserId: mocks.getUserId,
  getUsername: mocks.getUsername,
  getVenueId: mocks.getVenueId,
}));
vi.mock("@/lib/nativeApp", () => ({ isNativeApp: mocks.isNativeApp, openInSystemBrowser: async () => true }));
vi.mock("@/lib/nativeInstagramStories", () => ({
  getInstagramStorySupport: mocks.instagramSupport,
  NO_INSTAGRAM_STORY: { picture: false, video: false },
  shareToInstagramStory: mocks.shareToInstagramStory,
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
  mocks.canMakeVideo.mockReset();
  mocks.canMakeVideo.mockResolvedValue(false);
  mocks.encodeVideo.mockReset();
  mocks.encodeVideo.mockImplementation(async () => new Blob(["mp4"], { type: "video/mp4" }));
  mocks.shareImage.mockClear();
  mocks.isNativeApp.mockReset();
  mocks.isNativeApp.mockReturnValue(false);
  mocks.instagramSupport.mockReset();
  mocks.instagramSupport.mockResolvedValue({ picture: false, video: false });
  mocks.shareToInstagramStory.mockReset();
  mocks.shareToInstagramStory.mockResolvedValue("unavailable");
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

describe("celebration effects (docs/share-win-celebration-plan.md Phase 1)", () => {
  type Spec = { effects?: { behind: unknown[]; middle: unknown[]; front: unknown[] } | null };
  const lastSpec = (): Spec => mocks.renderDesign.mock.calls.at(-1)?.[0 as never] as unknown as Spec;
  const openSheet = async () => {
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
  };

  it("four chips, all off when the sheet opens: today's picture", async () => {
    await openSheet();
    for (const label of ["Fireworks", "Lasers", "Confetti", "Clapping"]) {
      expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed"), label).toBe("false");
    }
    for (const [spec] of mocks.renderDesign.mock.calls as unknown as Array<[Spec]>) expect(spec.effects ?? null).toBeNull();
  });

  it("a tap redraws the pictures with that effect, once (no redraw loop); a second tap takes it off", async () => {
    await openSheet();
    const before = mocks.renderDesign.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Fireworks" }));
    await waitFor(() => expect(mocks.renderDesign.mock.calls.length).toBe(before + 3));
    await settle();
    expect(mocks.renderDesign.mock.calls.length).toBe(before + 3);
    expect(screen.getByRole("button", { name: "Fireworks" }).getAttribute("aria-pressed")).toBe("true");
    expect(lastSpec().effects?.middle.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Fireworks" }));
    await waitFor(() => expect(mocks.renderDesign.mock.calls.length).toBe(before + 6));
    expect(lastSpec().effects ?? null).toBeNull();
  });

  it("while the new picture draws, the old one stays on screen but can't be shared", async () => {
    await openSheet();
    const shown = screen.getByRole("img").getAttribute("src");
    let finish: (blob: Blob) => void = () => {};
    mocks.renderDesign.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Confetti" }));
    await settle();
    expect(screen.getByRole("img").getAttribute("src")).toBe(shown);
    expect(revoked.has(shown!)).toBe(false);
    expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(true);

    await act(async () => finish(new Blob(["png"], { type: "image/png" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("img").getAttribute("src")).not.toBe(shown);
    // The replaced picture is released once, after its replacement landed.
    expect(revoked.has(shown!)).toBe(true);
  });
});

describe("animated Story (docs/share-win-celebration-plan.md Phase 2)", () => {
  const openSheet = async () => {
    render(createElement(StoryShareLauncher, { payload: payloadAt("2026-10-22T10:00:00.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Create story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
  };
  const facebookDisabled = () => screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled");

  it("a browser that can't make video never sees Still / Animated, and nothing is encoded", async () => {
    await openSheet();
    await settle();
    expect(mocks.canMakeVideo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Animated" })).toBeNull();
    expect(mocks.encodeVideo).not.toHaveBeenCalled();
  });

  it("Still at open; Animated needs an effect; Post hides it", async () => {
    mocks.canMakeVideo.mockResolvedValue(true);
    await openSheet();
    await waitFor(() => expect(screen.getByRole("button", { name: "Animated" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Still" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Animated" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Animated" })).toBeNull();
    expect(mocks.encodeVideo).not.toHaveBeenCalled();
  });

  it("Animated makes the video once, shares it as an MP4, and Still goes back to the picture", async () => {
    mocks.canMakeVideo.mockResolvedValue(true);
    let finish: (blob: Blob) => void = () => {};
    mocks.encodeVideo.mockImplementationOnce(async (_input, options) => {
      options?.onProgress?.(0.4);
      return new Promise<Blob>((resolve) => { finish = resolve; });
    });
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Fireworks" }));
    await waitFor(() => expect(facebookDisabled()).toBe(false));
    await waitFor(() => expect(screen.getByRole("button", { name: "Animated" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Animated" }));
    await waitFor(() => expect(screen.getByText(/Making your Story… 40%/)).toBeTruthy());
    // Nothing to share until the video is made.
    expect(facebookDisabled()).toBe(true);
    expect(mocks.encodeVideo).toHaveBeenCalledTimes(1);

    await act(async () => finish(new Blob(["mp4"], { type: "video/mp4" })));
    await waitFor(() => expect(facebookDisabled()).toBe(false));
    await settle();
    expect(mocks.encodeVideo).toHaveBeenCalledTimes(1);
    expect(document.querySelector("video")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Facebook" }));
    await waitFor(() => expect(mocks.shareImage).toHaveBeenCalledTimes(1));
    const shared = mocks.shareImage.mock.calls[0][0];
    expect(shared.blob.type).toBe("video/mp4");
    expect(shared.fileName).toMatch(/\.mp4$/);

    fireEvent.click(screen.getByRole("button", { name: "Still" }));
    await settle();
    expect(document.querySelector("video")).toBeNull();
    expect(facebookDisabled()).toBe(false);
  });

  it("a new effect while the video is made cancels it and makes the new one; Cancel goes back to Still", async () => {
    mocks.canMakeVideo.mockResolvedValue(true);
    const signals: AbortSignal[] = [];
    mocks.encodeVideo.mockImplementation((_input, options) => {
      signals.push(options!.signal!);
      return new Promise<Blob>(() => {});
    });
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Lasers" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Animated" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Animated" }));
    await waitFor(() => expect(signals).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Confetti" }));
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(signals[1].aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Still" }).getAttribute("aria-pressed")).toBe("true");
    expect(signals).toHaveLength(2);
  });

  // Phase 3: the app's Instagram Story button sends the video itself on builds whose plugin says so.
  const makeVideoInApp = async (support: { picture: boolean; video: boolean }) => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.instagramSupport.mockResolvedValue(support);
    mocks.canMakeVideo.mockResolvedValue(true);
    await openSheet();
    await waitFor(() => expect(mocks.instagramSupport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Fireworks" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Animated" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Animated" }));
    await waitFor(() => expect(facebookDisabled()).toBe(false));
    await settle();
  };

  it("in a Phase 3.2 app build, Instagram Story hands the plugin the MP4 (no share sheet)", async () => {
    mocks.shareToInstagramStory.mockResolvedValue("opened");
    await makeVideoInApp({ picture: true, video: true });
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await waitFor(() => expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1));
    expect(mocks.shareToInstagramStory.mock.calls[0][0].type).toBe("video/mp4");
    // The story's own file name, so the share-sheet path and the one-tap path reuse one cache file (3.2).
    expect(mocks.shareToInstagramStory.mock.calls[0][1]).toMatchObject({ fileName: expect.stringMatching(/^hightop-.+\.mp4$/) });
    expect(mocks.shareImage).not.toHaveBeenCalled();
  });

  it("in an older app build, the video takes the share sheet and the plugin is never called", async () => {
    await makeVideoInApp({ picture: true, video: false });
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await waitFor(() => expect(mocks.shareImage).toHaveBeenCalledTimes(1));
    expect(mocks.shareImage.mock.calls[0][0].blob.type).toBe("video/mp4");
    expect(mocks.shareToInstagramStory).not.toHaveBeenCalled();
  });

  it("when Instagram doesn't open, the hint says video and the next tap takes the share sheet", async () => {
    mocks.shareToInstagramStory.mockResolvedValue("failed");
    await makeVideoInApp({ picture: true, video: true });
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await screen.findByText("Instagram didn't open. Tap More to share the video.");
    expect(mocks.shareImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await waitFor(() => expect(mocks.shareImage).toHaveBeenCalledTimes(1));
    expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1);
  });

  it("a failed video keeps the one-tap picture; a removed Instagram drops both", async () => {
    mocks.shareToInstagramStory.mockResolvedValue("failed");
    await makeVideoInApp({ picture: true, video: true });
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await screen.findByText("Instagram didn't open. Tap More to share the video.");
    fireEvent.click(screen.getByRole("button", { name: "Still" }));
    await waitFor(() => expect(facebookDisabled()).toBe(false));
    mocks.shareToInstagramStory.mockClear();
    mocks.shareToInstagramStory.mockResolvedValue("opened");
    fireEvent.click(screen.getByRole("button", { name: "Instagram Story" }));
    await waitFor(() => expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1));
    expect(mocks.shareToInstagramStory.mock.calls[0][0].type).toBe("image/png");
  });

  it("a failed video says so and Try again makes it afresh", async () => {
    mocks.canMakeVideo.mockResolvedValue(true);
    mocks.encodeVideo.mockRejectedValueOnce(new Error("encoder broke"));
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Clapping" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Animated" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Animated" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't make the video/));
    expect(facebookDisabled()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(facebookDisabled()).toBe(false));
    expect(mocks.encodeVideo).toHaveBeenCalledTimes(2);
  });
});
