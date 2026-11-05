// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import type { OwnerSchedule } from "@/types";

// Share to social sheet (docs/partner-social-promo-plan.md Phase 1). The picture is drawn by a canvas
// the test DOM doesn't have, so the renderer is mocked; everything the partner reads and picks is real.
// createElement, not JSX (*.test.ts glob).

const renderPromoPicture = vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }));
vi.mock("@/lib/promo/promoRender", () => ({ renderPromoPicture: (...args: unknown[]) => renderPromoPicture(...(args as [])) }));

// The Reel (Phase 2) needs WebCodecs + Web Audio, which the test DOM doesn't have: mocked too.
const canMakeReel = vi.fn(async () => false);
vi.mock("@/lib/promo/promoReelSupport", () => ({ canMakeReel: () => canMakeReel() }));
const prepareReel = vi.fn(async (input: unknown) => ({ input, plan: { durationS: 15 }, draw: vi.fn(), mix: vi.fn() }));
const encodeReel = vi.fn(async (_scene: unknown, options?: { onProgress?: (fraction: number) => void }) => {
  options?.onProgress?.(0.5);
  return new Blob(["mp4"], { type: "video/mp4" });
});
vi.mock("@/lib/promo/promoReelRender", () => ({
  prepareReel: (input: unknown) => prepareReel(input),
  encodeReel: (scene: unknown, options?: { onProgress?: (fraction: number) => void }) => encodeReel(scene, options),
  playReelPreview: vi.fn(async () => () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/owner/dashboard",
  useSearchParams: () => new URLSearchParams("sheet=social"),
}));

const { ShareToSocialSheet } = await import("@/components/owner/social/ShareToSocialSheet");

const nav = (sheet: string | null): UseOwnerSheetResult =>
  ({
    sheet,
    step: null,
    displayStepFor: () => null,
    openSheet: vi.fn(),
    goToStep: vi.fn(),
    correctStep: vi.fn(),
    goBack: vi.fn(),
    closeSheet: vi.fn(),
  }) as unknown as UseOwnerSheetResult;

const schedule: OwnerSchedule = {
  id: "s1",
  venueId: "v1",
  title: "Thursday Trivia",
  startTime: "2026-11-06T01:00:00.000Z",
  endTime: "2026-11-06T03:00:00.000Z",
  timezone: "America/New_York",
  recurringType: "weekly",
  recurringDays: ["thu"],
  windowMinutes: 120,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  gameType: "live_trivia",
};

const giftCard = {
  id: "p1",
  isActive: true,
  winnerUserId: null,
  rewardDefinitionId: "live_trivia_challenge",
  winCondition: "game_winner",
  pointsRequiredToWin: 500,
  gameWinnerSlots: null,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 50,
} as unknown as OwnerCompetition;

const DETAILS = { instagramHandle: "thepourhouse", showName: true, showAddress: true, showInstagram: true };

const props = (overrides: Record<string, unknown> = {}) => ({
  nav: nav("social"),
  venueId: "v1",
  venueName: "The Pour House",
  games: { status: "ready" as const, items: [schedule] },
  rewards: { status: "ready" as const, items: [giftCard] },
  nowMs: Date.parse("2026-11-01T12:00:00.000Z"),
  ...overrides,
});

describe("ShareToSocialSheet", () => {
  beforeEach(() => {
    renderPromoPicture.mockClear();
    canMakeReel.mockReset();
    canMakeReel.mockResolvedValue(false);
    prepareReel.mockClear();
    encodeReel.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, details: DETAILS }), { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("closed: draws nothing and asks for nothing", () => {
    render(createElement(ShareToSocialSheet, props({ nav: nav(null) })));
    expect(screen.queryByText("Share to social")).toBeNull();
    expect(renderPromoPicture).not.toHaveBeenCalled();
  });

  it("open: offers the scheduled game first, with its prize ticked, and no caption box (Andrew, 2026-11-04)", async () => {
    render(createElement(ShareToSocialSheet, props()));
    const game = screen.getByRole("button", { name: /Live Trivia · Every Thursday · 8 PM/ });
    expect(game.getAttribute("aria-pressed")).toBe("true");
    const prizeChip = screen.getByRole("button", { name: /\$50 gift card/ });
    expect(prizeChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy caption" })).toBeNull();
    await waitFor(() => expect(renderPromoPicture).toHaveBeenCalled());
  });

  it("opens on the game just created when given a focus", async () => {
    const later: OwnerSchedule = { ...schedule, id: "s2", startTime: "2026-11-13T01:00:00.000Z", endTime: "2026-11-13T03:00:00.000Z", recurringType: "none", recurringDays: [] };
    render(createElement(ShareToSocialSheet, props({ games: { status: "ready", items: [schedule, later] }, focus: { scheduleId: "s2" } })));
    const buttons = screen.getAllByRole("button", { pressed: true }).map((button) => button.textContent ?? "");
    expect(buttons.some((text) => text.includes("Nov 12"))).toBe(true);
    expect(buttons.some((text) => text.includes("Every Thursday"))).toBe(false);
    await waitFor(() => expect(renderPromoPicture).toHaveBeenCalled());
  });

  it("unticking the prize takes it off the picture", async () => {
    render(createElement(ShareToSocialSheet, props()));
    await waitFor(() => expect(renderPromoPicture).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /\$50 gift card/ }));
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ prizes: unknown[] }] | undefined;
      expect(last?.[0].prizes).toEqual([]);
    });
  });

  it("On the picture: the bar name and saved handle are ticked, and unticking takes them off this picture only", async () => {
    render(createElement(ShareToSocialSheet, props()));
    const handleChip = await screen.findByRole("button", { name: /@thepourhouse/ });
    expect(handleChip.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ instagramHandle: string | null }] | undefined;
      expect(last?.[0].instagramHandle).toBe("thepourhouse");
    });
    expect(screen.getByRole("button", { name: /Bar name\s*The Pour House/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Bar name/ }));
    fireEvent.click(handleChip);
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ venueName: string | null; instagramHandle: string | null }] | undefined;
      expect(last?.[0].venueName).toBeNull();
      expect(last?.[0].instagramHandle).toBeNull();
    });
    // Per post: the venue's setting for players' share pictures is never written.
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    expect(screen.queryByText("On shared pictures")).toBeNull();
  });

  it("the venue's players' 'On shared pictures' choices don't set the starting ticks (D33/D36)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, details: { ...DETAILS, showName: false, showInstagram: false } }), { status: 200 })),
    );
    render(createElement(ShareToSocialSheet, props({ venueId: "v4" })));
    const handleChip = await screen.findByRole("button", { name: /@thepourhouse/ });
    expect(handleChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Bar name/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Address: offered unticked when the venue has one; ticking puts it on the picture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, details: { ...DETAILS, address: "1010 Pacific St · Brooklyn, NY" } }), { status: 200 })),
    );
    render(createElement(ShareToSocialSheet, props({ venueId: "v3" })));
    const chip = await screen.findByRole("button", { name: /Address\s*1010 Pacific St/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ venueAddress: string | null }] | undefined;
      expect(last?.[0].venueAddress).toBe("1010 Pacific St · Brooklyn, NY");
    });
  });

  it("no handle saved: ticking Instagram handle asks for one, only Save puts it on the picture, and Save keeps players' choices", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true, details: { ...DETAILS, ...body } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ ok: true, details: { instagramHandle: null, showName: true, showAddress: false, showInstagram: false } }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ShareToSocialSheet, props({ venueId: "v2" })));
    const chip = await screen.findByRole("button", { name: /Instagram handle/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    fireEvent.change(screen.getByRole("textbox", { name: "Instagram handle" }), { target: { value: "@newbar" } });
    // Typed but not saved: nothing redraws and the handle is not on the picture.
    await waitFor(() => expect(renderPromoPicture).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 250));
    const callsBeforeSave = renderPromoPicture.mock.calls.length;
    for (const call of renderPromoPicture.mock.calls as unknown as [{ instagramHandle: string | null }][]) {
      expect(call[0].instagramHandle).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: /@newbar/ });
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ instagramHandle: string | null }] | undefined;
      expect(last?.[0].instagramHandle).toBe("newbar");
    });
    expect(renderPromoPicture.mock.calls.length).toBe(callsBeforeSave + 1);
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      venueId: "v2",
      instagramHandle: "newbar",
      showName: true,
      showAddress: false,
      showInstagram: false,
    });
    expect(screen.queryByRole("textbox", { name: "Instagram handle" })).toBeNull();
  });

  it("still loading: a loader, no picture", () => {
    render(createElement(ShareToSocialSheet, props({ games: { status: "loading" } })));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(renderPromoPicture).not.toHaveBeenCalled();
  });

  it("a browser that can't make video is offered Post and Story only", async () => {
    render(createElement(ShareToSocialSheet, props()));
    await waitFor(() => expect(canMakeReel).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^Post/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Reel/ })).toBeNull();
    expect(prepareReel).not.toHaveBeenCalled();
  });

  it("Reel: pick the music, Make Reel, then Download the video", async () => {
    canMakeReel.mockResolvedValue(true);
    render(createElement(ShareToSocialSheet, props()));
    fireEvent.click(await screen.findByRole("button", { name: /^Reel/ }));
    // The still preview is the Story picture: the Reel ends on that very frame.
    await waitFor(() => {
      const last = renderPromoPicture.mock.calls.at(-1) as unknown as [{ format: string }] | undefined;
      expect(last?.[0].format).toBe("story");
    });
    expect(screen.getByRole("button", { name: /Game-night beat/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/crowd cheer are built in/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /No music/ }));
    fireEvent.click(screen.getByRole("button", { name: "Make Reel" }));
    await waitFor(() => expect(encodeReel).toHaveBeenCalled());
    const reelInput = prepareReel.mock.calls[0]?.[0] as { musicId: string | null; prizes: { headline: string }[] };
    expect(reelInput.musicId).toBeNull();
    expect(reelInput.prizes.map((prize) => prize.headline)).toEqual(["$50 gift card"]);
    expect(await screen.findByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make Reel" })).toBeNull();
  });

  it("changing the Reel's music after making it asks for a new Reel", async () => {
    canMakeReel.mockResolvedValue(true);
    render(createElement(ShareToSocialSheet, props()));
    fireEvent.click(await screen.findByRole("button", { name: /^Reel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Make Reel" }));
    await screen.findByRole("button", { name: "Download" });
    fireEvent.click(screen.getByRole("button", { name: /No music/ }));
    expect(screen.getByRole("button", { name: "Make Reel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });

  it("a failed details load says so, Try again refetches, and the ticks then appear (Phase 12)", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? new Response(JSON.stringify({ ok: false }), { status: 500 })
          : new Response(JSON.stringify({ ok: true, details: DETAILS }), { status: 200 });
      }),
    );
    render(createElement(ShareToSocialSheet, props({ venueId: "v-retry" })));
    await screen.findByText("Couldn't load your address and Instagram handle.");
    expect(screen.queryByRole("button", { name: /Instagram handle/ })).toBeNull();
    // The rest of the sheet keeps working without them.
    expect(screen.getByRole("button", { name: /Bar name/ })).toBeTruthy();
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: /Instagram handle/ });
    expect(calls).toBe(2);
    expect(screen.queryByText("Couldn't load your address and Instagram handle.")).toBeNull();
  });

  it("never says Reward", () => {
    render(createElement(ShareToSocialSheet, props()));
    expect(document.body.textContent ?? "").not.toMatch(/reward/i);
  });
});
