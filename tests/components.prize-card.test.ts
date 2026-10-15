// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// docs/prize-gift-card-redesign-plan.md Phase 2: the prize card shows three things (headline,
// venue, label) and a logo that bounces when tapped — buzzing only when it is NOT inside the
// live coupon frame (the frame already buzzed; one moment, one buzz), and never swallowing the
// tap the frame needs for its sparkle. createElement, not JSX (the test glob is *.test.ts).

const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (pattern: string) => haptic(pattern) }));

const { PrizeCard, SAMPLE_PRIZE_CARD_FACE } = await import("@/components/prizes/PrizeCard");
const { LiveCouponFrame } = await import("@/components/prizes/LiveCouponFrame");
const { prizeCardFace } = await import("@/lib/prizeCardFace");
const { PRIZE_CARD } = await import("@/lib/themeTokens");
type PrizeCardBack = import("@/lib/prizeCardFace").PrizeCardBack;

type CardProps = ComponentProps<typeof PrizeCard>;
const card = (props: Partial<CardProps> = {}) => createElement(PrizeCard, { face: SAMPLE_PRIZE_CARD_FACE, ...props });

const logo = () => screen.getByRole("button", { name: "Hightop Challenge" });
const logoImage = (container: HTMLElement) => container.querySelector("[data-prize-card-logo] img") as HTMLImageElement;

afterEach(() => {
  cleanup();
  haptic.mockReset();
});

describe("PrizeCard — the face", () => {
  it("shows the headline, the venue and the label, and no other words", () => {
    const { container } = render(card());
    expect(container.querySelector("[data-prize-card-headline]")?.textContent).toBe("$25");
    expect(container.querySelector("[data-prize-card-venue]")?.textContent).toBe("YOUR VENUE");
    expect(container.querySelector("[data-prize-card-label]")?.textContent).toBe("GIFT CARD");
    expect(container.textContent).toBe("$25YOUR VENUEGIFT CARD");
  });

  it("is a labelled group that reads the face in one sentence", () => {
    render(card());
    expect(screen.getByRole("group", { name: "$25 gift card, YOUR VENUE" })).toBeTruthy();
  });

  it("draws a menu prize as a phrase and steps a long one down a size", () => {
    const { container, rerender } = render(
      card({ face: { ...SAMPLE_PRIZE_CARD_FACE, headline: "Free Appetizer", headlineKind: "phrase", label: "REWARD" } }),
    );
    const headline = () => container.querySelector("[data-prize-card-headline]")?.className ?? "";
    expect(headline()).toContain("text-2xl");
    expect(headline()).toContain("line-clamp-2");
    rerender(
      card({
        face: { ...SAMPLE_PRIZE_CARD_FACE, headline: "Free Chef's Tasting Platter", headlineKind: "phrase", label: "REWARD" },
      }),
    );
    expect(headline()).toContain("text-xl");
  });

  it("uses the large sizes in the redeem sheet", () => {
    const { container } = render(card({ size: "large" }));
    expect(container.querySelector("[data-prize-card-headline]")?.className).toContain("text-6xl");
    expect(logoImage(container).getAttribute("src")).toBe("/brand/web/htc-logo-192.webp");
  });

  it("shows no venue line when the venue is unknown", () => {
    const { container } = render(card({ face: { ...SAMPLE_PRIZE_CARD_FACE, venueName: null } }));
    expect(container.querySelector("[data-prize-card-venue]")?.textContent).toBe("");
  });

  it("greys out a redeemed or used card and says so in one chip", () => {
    for (const [status, word] of [
      ["redeemed", "Redeemed"],
      ["used", "Used"],
    ] as const) {
      const { container, unmount } = render(card({ face: { ...SAMPLE_PRIZE_CARD_FACE, status } }));
      const root = container.querySelector("[data-prize-card]") as HTMLElement;
      expect(root.className).toContain("grayscale");
      expect(root.className).toContain("opacity-60");
      expect(container.querySelector("[data-prize-card-chip]")?.textContent).toBe(word);
      unmount();
    }
    const { container } = render(card());
    expect(container.querySelector("[data-prize-card-chip]")).toBeNull();
    expect((container.querySelector("[data-prize-card]") as HTMLElement).className).not.toContain("grayscale");
  });

  it("draws a real win through prizeCardFace", () => {
    const face = prizeCardFace(
      {
        challengeId: "c1",
        venueId: "v1",
        challengeName: "Live Trivia",
        challengeRules: "",
        winnerUserId: "u1",
        prizeKind: "menu_item",
        prizeMenuItem: "appetizer",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 100,
      },
      "Pacific Street",
    );
    render(card({ face }));
    expect(screen.getByRole("group", { name: "Free Appetizer reward, Pacific Street" })).toBeTruthy();
  });
});

describe("PrizeCard — the bouncing logo", () => {
  it("is a labelled button that starts still", () => {
    const { container } = render(card());
    expect(logo().getAttribute("type")).toBe("button");
    expect(logoImage(container).className).not.toContain("animate-logo-tap-bounce");
    expect(logoImage(container).getAttribute("src")).toBe("/brand/web/htc-logo-192.webp");
  });

  it("out-ranks the global phone button padding and min-height, so it stays flush on an iPhone SE", () => {
    // app/globals.css gives `button:not(:disabled)` side padding (≤380 px) and min-height 36 px
    // (≤430 px) with !important; a plain `p-0` loses to that selector.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/button:not\(:disabled\),\s*a\[role="button"\]\s*\{\s*padding-left: 0\.5rem !important;/);
    render(card());
    expect(logo().className).toContain("[&:not(:disabled)]:!p-0");
    expect(logo().className).toContain("[&:not(:disabled)]:!min-h-0");
  });

  it("is 2× the Phase 2 size (Andrew, 2026-10-15), shrinking to fit a narrow card", () => {
    const list = render(card());
    expect(logoImage(list.container).getAttribute("width")).toBe("80");
    expect(logoImage(list.container).className).toContain("max-h-20");
    // Fills the height the headline leaves rather than pushing the venue row off the card.
    expect(logoImage(list.container).className).toContain("h-full");
    cleanup();
    const large = render(card({ size: "large" }));
    expect(logoImage(large.container).getAttribute("width")).toBe("96");
    expect(logoImage(large.container).className).toContain("max-h-24");
  });

  it("bounces on tap, restarting the animation on every tap", () => {
    const { container } = render(card());
    fireEvent.click(logo());
    const first = logoImage(container);
    expect(first.className).toContain("animate-logo-tap-bounce");
    expect(first.className).toContain("origin-bottom");
    fireEvent.click(logo());
    // Re-keyed: a fresh element, so the keyframe starts over.
    expect(logoImage(container)).not.toBe(first);
    expect(logoImage(container).className).toContain("animate-logo-tap-bounce");
  });

  it("swaps the travel for a blink under Reduce Motion", () => {
    const { container } = render(card());
    fireEvent.click(logo());
    expect(logoImage(container).className).toContain("motion-reduce:animate-logo-tap-dip");
  });

  it("buzzes once per tap on its own", () => {
    render(card());
    fireEvent.click(logo());
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("selection");
  });

  it("never buzzes inside the live frame (the frame already did)", () => {
    render(card({ inLiveFrame: true }));
    fireEvent.click(logo());
    expect(haptic).not.toHaveBeenCalled();
  });

  it("inside the live frame, a logo tap still reaches the frame: one buzz and a sparkle", () => {
    const { container } = render(
      createElement(
        LiveCouponFrame,
        // `children` goes positionally (react/no-children-prop), so the props object is cast.
        { clockOffsetMs: 0, username: "Rick", venueName: "Pacific Street" } as ComponentProps<typeof LiveCouponFrame>,
        card({ size: "large", inLiveFrame: true }),
      ),
    );
    fireEvent.pointerDown(logo());
    fireEvent.click(logo());
    expect(container.querySelector("[data-live-coupon-burst]")).not.toBeNull();
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(logoImage(container).className).toContain("animate-logo-tap-bounce");
  });
});

// ── Phase 4: the flip (plan §2.8) ─────────────────────────────────────────────

const BACK: PrizeCardBack = {
  rows: [
    { key: "won", label: "Won", value: "Oct 12, 2026" },
    { key: "for", label: "For", value: "You finished 1st in Live Trivia" },
    { key: "terms", label: "Terms", value: "Good for $25 off your bill" },
    { key: "expires", label: "Expires", value: "Oct 16, 2026", tone: "urgent" },
  ],
  stamp: null,
};

const parts = (container: HTMLElement) => ({
  root: container.querySelector("[data-prize-card]") as HTMLElement,
  flipper: container.querySelector("[data-prize-card-flipper]") as HTMLElement,
  front: container.querySelector("[data-prize-card-front]") as HTMLElement,
  back: container.querySelector("[data-prize-card-back]") as HTMLElement,
});

describe("PrizeCard — the flip", () => {
  it("without a back it is the flat card: no flip, no toggle, nothing to turn", () => {
    const { container } = render(card());
    expect(container.querySelector("[data-prize-card-flipper]")).toBeNull();
    expect(container.querySelector("[data-prize-card-back]")).toBeNull();
    expect(container.querySelector("[data-prize-card]")?.hasAttribute("data-prize-card-flipped")).toBe(false);
    expect(screen.queryByRole("button", { name: "Show details" })).toBeNull();
  });

  it("a tap on the card flips it, and a second tap flips it back", () => {
    const { container } = render(card({ back: BACK }));
    const { root, flipper } = parts(container);
    expect(root.getAttribute("data-prize-card-flipped")).toBe("false");
    fireEvent.click(flipper.querySelector("[data-prize-card-headline]") as HTMLElement);
    expect(root.getAttribute("data-prize-card-flipped")).toBe("true");
    expect(flipper.className).toContain("motion-safe:[transform:rotateY(180deg)]");
    fireEvent.click(parts(container).back);
    expect(root.getAttribute("data-prize-card-flipped")).toBe("false");
    expect(parts(container).flipper.className).not.toContain("rotateY(180deg)");
  });

  it("the back shows its rows (urgency as a colour) and turns the face away from readers", () => {
    const { container } = render(card({ back: BACK }));
    fireEvent.click(parts(container).flipper);
    const { front, back } = parts(container);
    expect(Array.from(back.querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Won", "For", "Terms", "Expires"]);
    expect(back.querySelector('[data-prize-card-back-row="expires"] dd')?.className).toContain(PRIZE_CARD.urgentText);
    expect(front.getAttribute("aria-hidden")).toBe("true");
    expect(front.hasAttribute("inert")).toBe(true);
    expect(back.hasAttribute("aria-hidden")).toBe(false);
    expect(back.hasAttribute("inert")).toBe(false);
    // Face-up again: the back is the one turned away.
    fireEvent.click(back);
    expect(parts(container).back.getAttribute("aria-hidden")).toBe("true");
    expect(parts(container).back.hasAttribute("inert")).toBe(true);
    expect(parts(container).front.hasAttribute("inert")).toBe(false);
  });

  it("a logo tap bounces but does not flip", () => {
    const { container } = render(card({ back: BACK }));
    fireEvent.click(logo());
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("false");
    expect(logoImage(container).className).toContain("animate-logo-tap-bounce");
  });

  it("an action tap calls onPress and does not flip the card back", () => {
    const onPress = vi.fn();
    const { container } = render(card({ back: BACK, action: { label: "Redeem", onPress } }));
    fireEvent.click(parts(container).flipper);
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("true");
  });

  it("the action lives on the back, out of reach until the card is turned over", () => {
    render(card({ back: BACK, action: { label: "Redeem", onPress: vi.fn() } }));
    expect(screen.queryByRole("button", { name: "Redeem" })).toBeNull();
  });

  it("keyboard and screen-reader users flip it with the hidden Show details / Show front toggle", () => {
    const { container } = render(card({ back: BACK }));
    const toggle = screen.getByRole("button", { name: "Show details" });
    expect(toggle.className).toContain("sr-only");
    expect(toggle.className).toContain("focus-visible:not-sr-only");
    fireEvent.click(toggle);
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Show front" }));
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("false");
  });

  it("a redeemed card's back carries the stamp and stays full contrast (the grey is the front's only)", () => {
    const { container } = render(
      card({ face: { ...SAMPLE_PRIZE_CARD_FACE, status: "redeemed" }, back: { ...BACK, stamp: "Redeemed Oct 15, 2026, 9:42 PM" } }),
    );
    fireEvent.click(parts(container).flipper);
    const { root, flipper, front, back } = parts(container);
    expect(back.querySelector("[data-prize-card-stamp]")?.textContent).toBe("Redeemed Oct 15, 2026, 9:42 PM");
    expect(front.className).toContain("grayscale");
    expect(front.className).toContain("opacity-60");
    for (const element of [root, flipper, back]) expect(element.className).not.toMatch(/grayscale|opacity-60/);
    for (const element of back.querySelectorAll("*")) expect(element.getAttribute("class") ?? "").not.toMatch(/grayscale|opacity-60/);
  });

  it("buzzes once per flip on its own, and never inside the live frame", () => {
    const { container } = render(card({ back: BACK }));
    fireEvent.click(parts(container).flipper);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("selection");
    cleanup();
    haptic.mockReset();
    const inFrame = render(card({ back: BACK, inLiveFrame: true }));
    fireEvent.click(parts(inFrame.container).flipper);
    expect(haptic).not.toHaveBeenCalled();
  });

  it("inside the live frame one tap is one buzz, one sparkle and one flip", () => {
    const { container } = render(
      createElement(
        LiveCouponFrame,
        { clockOffsetMs: 0, username: "Rick", venueName: "Pacific Street" } as ComponentProps<typeof LiveCouponFrame>,
        card({ size: "large", inLiveFrame: true, back: BACK }),
      ),
    );
    const { flipper } = parts(container);
    fireEvent.pointerDown(flipper);
    fireEvent.click(flipper);
    expect(container.querySelector("[data-live-coupon-burst]")).not.toBeNull();
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("true");
  });

  it("Reduce Motion cross-fades instead of rotating", () => {
    const { container } = render(card({ back: BACK }));
    fireEvent.click(parts(container).flipper);
    const { flipper, front, back } = parts(container);
    expect(flipper.className).toContain("motion-reduce:transition-none");
    // The rotation only ever applies with motion allowed.
    expect(flipper.className).not.toMatch(/(^|\s)\[transform:rotateY/);
    expect(back.className).toContain("motion-safe:[transform:rotateY(180deg)]");
    expect(front.className).toContain("motion-reduce:opacity-0");
    expect(back.className).toContain("motion-reduce:duration-150");
  });

  it("starts face-down only when asked (the specimen renderer)", () => {
    const { container } = render(card({ back: BACK, initialFlipped: true }));
    expect(parts(container).root.getAttribute("data-prize-card-flipped")).toBe("true");
  });
});

describe("PrizeCard — source rules", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
  const files = ["components/prizes/PrizeCard.tsx", "components/prizes/PrizeCardLogo.tsx", "components/prizes/PrizeCardBackFace.tsx"];

  it("holds no hex colours (they live in PRIZE_CARD) and never the 1.7 MB logo PNG", () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, file).not.toContain("/brand/htc-logo.png");
      expect(source, file).not.toContain("fetch(");
    }
  });

  it("never stops a tap from reaching the live frame", () => {
    for (const file of files) expect(read(file), file).not.toContain("stopPropagation");
  });

  it("nothing that flattens preserve-3d sits on the perspective root or the rotating element (iOS Safari)", () => {
    const source = read("components/prizes/PrizeCard.tsx");
    for (const hook of ["data-prize-card-flipper", "data-prize-card-flipped"]) {
      // The className of the element carrying this hook (the rotating element / the perspective root).
      const element = source.slice(source.indexOf(hook), source.indexOf(">", source.indexOf("className=", source.indexOf(hook))));
      expect(element, hook).not.toMatch(/overflow-|opacity-|grayscale|filter|blur|PRIZE_CARD\.glow/);
    }
    // Both faces hide their backs, with the -webkit- form iOS needs.
    expect(source.match(/\[backface-visibility:hidden\] \[-webkit-backface-visibility:hidden\]/g)).toHaveLength(2);
  });

  it("uses the body font variable, never a literal family name", () => {
    const source = read("components/prizes/PrizeCard.tsx");
    expect(source).toContain("[font-family:var(--ht-font-body)]");
    expect(source).not.toMatch(/Nunito|Bree/);
  });
});
