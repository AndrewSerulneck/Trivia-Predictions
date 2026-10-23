// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SHARE_DESTINATION_COPY } from "@/lib/socialShare/copyPresets";
import { buildLiveTriviaStorySharePayload } from "@/lib/socialShare/storyPayloads";

// Native-app plan Phase 9f.1: share-sheet taps that reported the wrong result (R1 X's new tab,
// R2 two taps = two shares, R3 no share sheet after an await). Phase 9f.2: the in-app Story shortcut
// hands the plugin the caption, after our own copy has landed.

const mocks = vi.hoisted(() => ({
  isNativeApp: vi.fn(() => false),
  openInSystemBrowser: vi.fn(async () => true),
  canShareToInstagramStory: vi.fn(async () => false),
  shareToInstagramStory: vi.fn(async (): Promise<"opened" | "unavailable" | "failed"> => "opened"),
  canShareFile: vi.fn(() => true),
  shareImage: vi.fn(async () => ({ status: "shared" as const, fallbackRecommended: false })),
  saveImage: vi.fn(() => ({ status: "saved" as const })),
  trackFallback: vi.fn(),
  copyText: vi.fn(async () => true),
}));

vi.mock("@/lib/nativeApp", () => ({ isNativeApp: mocks.isNativeApp, openInSystemBrowser: mocks.openInSystemBrowser }));
vi.mock("@/lib/nativeInstagramStories", () => ({
  canShareToInstagramStory: mocks.canShareToInstagramStory,
  shareToInstagramStory: mocks.shareToInstagramStory,
}));
vi.mock("@/lib/nativeImageShare", () => ({ canShareImageNatively: () => false }));
vi.mock("@/lib/copyText", () => ({ copyText: mocks.copyText }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/scrollLock", () => ({ setScrollLock: vi.fn() }));
vi.mock("@/components/navigation/nativeBackButton", () => ({ useNativeBackHandler: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  createStoryShareAnalyticsId: () => "share-1",
  trackStoryCameraPermissionResult: vi.fn(),
  trackStoryCaptureCompleted: vi.fn(),
  trackStoryShareAttempted: vi.fn(),
  trackStoryShareCompleted: vi.fn(),
  trackStoryShareFallbackUsed: mocks.trackFallback,
  trackStoryShareOpened: vi.fn(),
}));
vi.mock("@/lib/socialShare/platform/webStoryPlatform", () => ({
  webStoryPlatform: {
    renderDesign: async () => new Blob(["png"], { type: "image/png" }),
    createShareFile: ({ blob }: { blob: Blob }) => blob,
    canShareFile: mocks.canShareFile,
    shareImage: mocks.shareImage,
    saveImage: mocks.saveImage,
    detectCapabilities: () => ({ hasMediaDevices: false }),
    getCameraPermissionState: async () => "prompt",
  },
}));

const { StoryCaptureModal } = await import("@/components/social-share/StoryCaptureModal");
const { prepareStorySharePayload } = await import("@/lib/socialShare/storyPayloads");

const story = prepareStorySharePayload(
  buildLiveTriviaStorySharePayload({
    venueId: "venue-1",
    venueName: "The High Top",
    userId: "user-1",
    username: "ace",
    finalRank: 1,
    finalPoints: 120,
    correctRate: 80,
    achievedAtIso: "2026-07-11T18:00:00.000Z",
  }),
);

const openSheet = async () => {
  render(createElement(StoryCaptureModal, { isOpen: true, onClose: () => {}, preparedStory: story }));
  // The picture is drawn on the phone; the destinations unlock when it is ready.
  await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
};
const tap = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

beforeEach(() => {
  mocks.isNativeApp.mockReturnValue(false);
  mocks.canShareFile.mockReturnValue(true);
  mocks.canShareToInstagramStory.mockResolvedValue(false);
  mocks.shareToInstagramStory.mockResolvedValue("opened");
  mocks.shareImage.mockResolvedValue({ status: "shared", fallbackRecommended: false });
  mocks.copyText.mockResolvedValue(true);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.values(mocks).forEach((mock) => mock.mockClear());
});

describe("Phase 9f.1 R1 — X's new tab", () => {
  it("a tab that really opens is reported as opened, with the opener severed", async () => {
    mocks.canShareFile.mockReturnValue(false); // desktop: no picture share, so X opens x.com's post page
    const tab = { opener: "set" } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    await openSheet();
    tap("X");
    await screen.findByText(SHARE_DESTINATION_COPY.x.direct);
    expect(open).toHaveBeenCalledWith(expect.stringContaining("https://x.com/intent/post?text="), "_blank");
    expect(tab.opener).toBeNull();
    expect(mocks.trackFallback).toHaveBeenCalledWith(expect.objectContaining({ resultReason: "x: opened" }));
  });

  it("a blocked pop-up still says it couldn't open X", async () => {
    mocks.canShareFile.mockReturnValue(false);
    vi.spyOn(window, "open").mockReturnValue(null);
    await openSheet();
    tap("X");
    await screen.findByText("Couldn't open X. Try More instead.");
    expect(mocks.trackFallback).toHaveBeenCalledWith(expect.objectContaining({ resultReason: "x: blocked" }));
  });
});

describe("Phase 9f.1 R2 — two taps in one frame run one share", () => {
  it("only the first of two taps reaches the share sheet and analytics", async () => {
    let finishShare: (value: { status: "shared"; fallbackRecommended: false }) => void = () => {};
    mocks.shareImage.mockImplementation(() => new Promise((resolve) => (finishShare = resolve)));
    await openSheet();
    const facebook = screen.getByRole("button", { name: "Facebook" });
    const more = screen.getByRole("button", { name: "More" });
    // Both clicks land before React re-renders: state set by the first can't be seen by the second.
    act(() => {
      fireEvent.click(facebook);
      fireEvent.click(more);
    });
    expect(mocks.shareImage).toHaveBeenCalledTimes(1);
    expect(mocks.copyText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copy caption + link" }).hasAttribute("disabled")).toBe(true);
    await act(async () => finishShare({ status: "shared", fallbackRecommended: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Facebook" }).hasAttribute("disabled")).toBe(false));
  });

  it("two Instagram Story taps run the plugin once", async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.canShareToInstagramStory.mockResolvedValue(true);
    let finish: (outcome: "opened") => void = () => {};
    mocks.shareToInstagramStory.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await openSheet();
    await waitFor(() => expect(mocks.canShareToInstagramStory).toHaveBeenCalled());
    await act(async () => {});
    const story = screen.getByRole("button", { name: "Instagram Story" });
    act(() => {
      fireEvent.click(story);
      fireEvent.click(story);
    });
    // The plugin runs once our caption copy has landed (9f.2), so wait a tick for it.
    await waitFor(() => expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1));
    expect(mocks.copyText).toHaveBeenCalledTimes(1);
    expect(mocks.trackFallback).not.toHaveBeenCalled();
    await act(async () => finish("opened"));
    expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1);
    expect(mocks.trackFallback).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 9f.1 R3 — no share sheet after an await", () => {
  it.each(["unavailable", "failed"] as const)("Instagram outcome %s shows the hint and does not open the sheet", async (outcome) => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.canShareToInstagramStory.mockResolvedValue(true);
    mocks.shareToInstagramStory.mockResolvedValue(outcome);
    await openSheet();
    await act(async () => {});
    tap("Instagram Story");
    await screen.findByText("Instagram didn't open. Tap More to share the picture.");
    expect(mocks.shareImage).not.toHaveBeenCalled();
    // The shortcut is dropped, so the next tap (a real one) takes the ordinary share-sheet path.
    tap("Instagram Story");
    await waitFor(() => expect(mocks.shareImage).toHaveBeenCalledTimes(1));
    expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1);
  });

  it("an opened Story keeps its own hint", async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.canShareToInstagramStory.mockResolvedValue(true);
    await openSheet();
    await act(async () => {});
    tap("Instagram Story");
    await screen.findByText(SHARE_DESTINATION_COPY["instagram-story"].direct);
    expect(mocks.shareImage).not.toHaveBeenCalled();
  });
});

describe("Phase 9f.2 — the in-app Story shortcut keeps the copied caption", () => {
  it("copies first, then hands the plugin the same caption + link", async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.canShareToInstagramStory.mockResolvedValue(true);
    const order: string[] = [];
    mocks.copyText.mockImplementation(async () => {
      await Promise.resolve();
      order.push("copied");
      return true;
    });
    mocks.shareToInstagramStory.mockImplementation(async () => {
      order.push("plugin");
      return "opened";
    });
    await openSheet();
    await act(async () => {});
    tap("Instagram Story");
    await screen.findByText(SHARE_DESTINATION_COPY["instagram-story"].direct);
    expect(mocks.copyText).toHaveBeenCalledWith(story.shareText);
    expect(mocks.shareToInstagramStory).toHaveBeenCalledWith(expect.any(Blob), { caption: story.shareText });
    // Our write can never land after the plugin's and wipe the picture.
    expect(order).toEqual(["copied", "plugin"]);
  });

  it("a failed copy is still reported as failed", async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.canShareToInstagramStory.mockResolvedValue(true);
    mocks.copyText.mockResolvedValue(false);
    await openSheet();
    await act(async () => {});
    tap("Instagram Story");
    await waitFor(() => expect(mocks.shareToInstagramStory).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SHARE_DESTINATION_COPY["instagram-story"].direct)).toBeNull();
  });
});
