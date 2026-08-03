"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { getUserId, getVenueId, getUsername } from "@/lib/storage";
import { useScheduleUpdatedFlash } from "@/lib/hooks/useScheduleUpdatedBroadcast";
import ScheduleUpdatedToast from "@/components/ui/ScheduleUpdatedToast";
import { useCategoryBlitzSession, type CategoryBlitzPhase } from "@/lib/categoryBlitzRealtime";
import { isCategoryBlitzTestModeEnabled, setCategoryBlitzTestMode } from "@/lib/categoryBlitzTestMode";
import { answerStartsWithLetter, categoryBlitzChannelName, lobbyDwellSeconds } from "@/lib/categoryBlitzShared";
import { CB_LETTER_BADGE_LAYOUT_ID, cbCategoryRowLayoutId } from "@/lib/categoryBlitzMotion";
import { EASE_SNAP } from "@/lib/motionEasing";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";
import { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import RevealSequence from "@/components/category-blitz/RevealSequence";
import RoundStartReveal, { ROUND_START_REVEAL_MAX_MS } from "@/components/category-blitz/RoundStartReveal";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import ValidAnswerGlow from "@/components/category-blitz/ValidAnswerGlow";
import WrongLetterReject from "@/components/category-blitz/WrongLetterReject";
import TimerUrgency from "@/components/category-blitz/TimerUrgency";
import SubmitLockAnimation from "@/components/category-blitz/SubmitLockAnimation";
import IntermissionStatus from "@/components/category-blitz/IntermissionStatus";
import SessionCompleteFireworks from "@/components/category-blitz/SessionCompleteFireworks";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import DevAnimationPanel from "@/components/category-blitz/DevAnimationPanel";
import { RankBadge } from "@/components/trivia/RankBadge";
import { StoryShareLauncher } from "@/components/social-share/StoryShareLauncher";
import { buildCategoryBlitzStorySharePayload } from "@/lib/socialShare/storyPayloads";
import { GAME_THEME } from "@/lib/themeTokens";
import { MODE_CONFIG, getModeFlipTakeoverVariant, type CategoryBlitzThemeKey } from "@/lib/categoryBlitzModes";
import type { CategoryBlitzRoundResults, CategoryBlitzMode } from "@/types";


const LETTER_GRADIENT =
  "bg-[linear-gradient(132deg,#10b981_0%,#22c55e_50%,#14b8a6_100%)]";
const BORDER_ACTIVE = "border-emerald-400/60";
const BORDER_CARD = "border-emerald-400/30";
const TEXT_ACCENT = "text-emerald-300";
const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

/** Matches RoundStartReveal's LAYOUT_MORPH_TRANSITION so the badge/row FLIP
 *  uses the same branded easing on both ends of the reveal → gameplay morph. */
const LAYOUT_MORPH_TRANSITION = { duration: 0.45, ease: EASE_SNAP } as const;

/** How long AnsweringScreen keeps its layout-projection nodes alive after
 *  mounting out of the reveal: the morph's own duration plus a buffer for the
 *  frame(s) Framer spends measuring before it starts animating. After this the
 *  rows and badge render as plain elements — see `morphActive` in
 *  AnsweringScreen for why they must not stay projected for the whole round. */
const LAYOUT_MORPH_SETTLE_MS = LAYOUT_MORPH_TRANSITION.duration * 1000 + 120;

/** Fade-in for gameplay chrome that has no reveal counterpart (invite banner,
 *  header label, timer, progress bar) — delayed so it settles in just behind
 *  the badge/row morph instead of popping in the instant the reveal ends. */
const CHROME_ENTRANCE_TRANSITION = { duration: 0.3, ease: EASE_SNAP, delay: 0.12 } as const;
const LAYOUT_DEBUG_VERSION = "cbz-p4-keyboard-contract";

/**
 * The backdrop: `position: fixed; inset: 0`, so it covers the entire LAYOUT viewport
 * at all times. iOS never shrinks the layout viewport for the keyboard, so this
 * element's dark fill is the guarantee that a keyboard-open (or sub-pixel, or lagging)
 * sizing gap can't expose anything — whatever the visible frame misses is `#020617`,
 * the same color html/body are pinned to. See Finding F in
 * docs/category-blitz-app-feel-plan.md; the paint guarantee is deliberately decoupled
 * from the frame's live measurement so it cannot lag behind the keyboard animation.
 *
 * `z-[100]` resolves in the root stacking context (the play shell deliberately creates
 * none), which keeps VenueAccessOverlay (`z-[140]`) and the body-level overlays
 * (AnimationOverlay `z-[1200]`, venueGameTransition `z-2100`) above gameplay.
 *
 * Full app-wide z-index ladder (lowest to highest), recorded here because
 * nothing else does and a stray layer at any of these numbers going
 * unnoticed is exactly how six prior debugging rounds on this game missed
 * Finding B/C — see docs/category-blitz-app-feel-plan.md Phase 5:
 *   100   — this game portal (CategoryBlitzFrame backdrop)
 *   140   — VenueAccessOverlay (components/venue/VenueAccessOverlay.tsx)
 *   1000  — PageShell's fixed header (inert on this route, gone in Phase 3)
 *   1200  — AnimationOverlay (components/animations/AnimationOverlay.tsx)
 *   1600  — MobileAdhesionAd (components/ui/MobileAdhesionAd.tsx) — excluded
 *           from /category-blitz as of Phase 5, see isAdExcludedRoute there
 *   2100  — venueGameTransition's shared-element open/return overlay
 *   5000  — PopupAds (components/ui/PopupAds.tsx)
 *   6500  — GlobalTransitionOverlay (components/ui/GlobalTransitionOverlay.tsx)
 */
const BACKDROP_CLASS = "fixed inset-0 z-[100] overflow-hidden overscroll-none bg-slate-950";

/**
 * The visible frame: absolutely positioned inside the backdrop and sized/offset to the
 * VISUAL viewport via the `--cbz-visible-*` vars. Geometry lives in
 * `.tp-cbz-visible-frame` (app/globals.css) because the offset is applied with
 * `translate3d` rather than `top`/`left` — a transform is composited on the GPU and
 * updates on the same frame as the iOS keyboard animation, where `top` on a fixed
 * element is a layout property that lands a frame or more late.
 */
const VISIBLE_FRAME_CLASS =
  "tp-cbz-visible-frame absolute left-0 top-0 min-h-0 overflow-hidden overscroll-none";

/**
 * Every render branch of CategoryBlitzGame is wrapped in this pair. Keep them together:
 * the backdrop without the frame would ignore the keyboard, and the frame without the
 * backdrop is exactly the single-layer arrangement that let a sizing gap show whatever
 * was underneath (the magenta band, Findings F/G).
 *
 * `className` styles the visible frame — that is the element that owns the game's flex
 * column and its per-phase background (`pageTheme.pageBg`).
 */
function CategoryBlitzFrame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      data-category-blitz-game-root
      data-category-blitz-layout-version={LAYOUT_DEBUG_VERSION}
      className={BACKDROP_CLASS}
    >
      <div data-category-blitz-visible-frame className={`${VISIBLE_FRAME_CLASS} ${className}`}>
        {children}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type LayoutDebugSnapshot = {
  version: string;
  phase: string;
  url: string;
  activeElement: string;
  activeMarker: string;
  editorInputCount: number;
  answerListInputCount: number;
  answerRowCount: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
  visualWidth: number | null;
  visualHeight: number | null;
  visualOffsetLeft: number | null;
  visualOffsetTop: number | null;
  bodyOverflow: string;
  htmlOverflow: string;
  bodyScrollHeight: number;
  viewportFrame: string;
  bodyBackground: string;
  shellBackground: string;
  htmlBackground: string;
  appShellRect: string;
  mainRect: string;
  routeRect: string;
  rootRect: string;
  rootRectFull: string;
  frameRectFull: string;
  frameTransform: string;
  editorRect: string;
  gameRect: string;
  answerListRect: string;
  /** Finding F: does the visible frame's live rendered height reach visualViewport.height? */
  frameHeightGap: number | null;
  /** Finding G: does the visible frame's live rendered width reach visualViewport.width, at rest? */
  frameWidthGap: number | null;
  /** Phase 4: the backdrop must cover the whole LAYOUT viewport — `innerHeight/Width`
   *  minus its rect. Both must be 0 in every keyboard state; a non-zero value is a strip
   *  of screen the game does not paint, which is what any band ultimately shows through. */
  backdropHeightGap: number | null;
  backdropWidthGap: number | null;
  /** Finding A: non-"none" here means Framer Motion's layout projection is applying a transform
   *  to a row/badge outside the 450ms reveal morph window — i.e. still contributing, even if not
   *  the dominant symptom in the screenshots. */
  row0Transform: string;
  row0WrapTransform: string;
  letterBadgeTransform: string;
  /** Finding A / Phase 2: how many answer rows still carry a live layout-projection node.
   *  Must be 0 outside the reveal morph window — 12 means the projection scoping regressed. */
  projectedRowCount: number;
  /** Finding B: a stray venue-transition overlay (z-2100, magenta shell) that failed to unmount. */
  venueTransitionOverlayCount: number;
  /** Findings F/G / Phase 3: elements still painting `#a10d63`. Must be 0 during gameplay. */
  brandMagentaLayerCount: number;
  /** Findings B/C/F: every position:fixed element whose rect intersects the bottom 40% of the
   *  visual viewport, sorted by z-index descending — a stray overlay or the exposed magenta
   *  layer both show up here. */
  fixedOverlaysNearBottom: string[];
};

function formatRect(element: Element | null): string {
  if (!element) return "missing";
  const rect = element.getBoundingClientRect();
  return `${Math.round(rect.top)}:${Math.round(rect.height)}:${Math.round(rect.bottom)}`;
}

function formatRectFull(element: Element | null): string {
  if (!element) return "missing";
  const rect = element.getBoundingClientRect();
  return `l${Math.round(rect.left)}:t${Math.round(rect.top)}:w${Math.round(rect.width)}:h${Math.round(rect.height)}`;
}

function readTransform(selector: string): string {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return "missing";
  return window.getComputedStyle(el).transform;
}

/**
 * Findings B/C/F: every position:fixed element in the document whose rect intersects the bottom
 * 40% of the visual viewport, with its z-index and background — a stray ad/transition overlay or
 * the exposed magenta layer beneath a short-rendered game frame both show up here. Capped and
 * sorted by z-index descending since this is a full-document scan, gated behind ?cbzDebug=1.
 */
function listFixedOverlaysNearBottom(): string[] {
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const zoneTop = viewportTop + viewportHeight * 0.6;
  const zoneBottom = viewportTop + viewportHeight;

  const matches: { z: number; label: string }[] = [];
  const all = document.querySelectorAll<HTMLElement>("*");
  for (const el of all) {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.bottom < zoneTop || rect.top > zoneBottom) continue;
    const z = Number.parseInt(style.zIndex, 10);
    const idSuffix = el.id ? `#${el.id}` : "";
    const dataAttr = el.getAttribute("data-venue-transition");
    const dataSuffix = dataAttr !== null ? `[data-venue-transition=${dataAttr}]` : "";
    matches.push({
      z: Number.isFinite(z) ? z : -1,
      label: `${el.tagName.toLowerCase()}${idSuffix}${dataSuffix} z=${Number.isFinite(z) ? z : "auto"} rect=${Math.round(rect.top)}:${Math.round(rect.height)} bg=${style.backgroundColor}`,
    });
  }
  matches.sort((a, b) => b.z - a.z);
  return matches.slice(0, 8).map((m) => m.label);
}

/**
 * Findings F/G, Phase 3: how many elements anywhere in the document still paint the
 * Category Blitz brand magenta (`#a10d63` → `rgb(161, 13, 99)`, in either a background
 * color or a gradient). Phase 3 deleted the only such layer on this route
 * (GameLandingExperience's fixed branded background), so this must read 0 during
 * gameplay — if it ever reads non-zero, a magenta band on device has a DOM source and
 * this names it, rather than leaving "no DOM layer explains it" as the conclusion again.
 *
 * The reverse-mode ("Majority Rules!") takeover legitimately paints this exact magenta
 * full-screen, so anything inside the AnimationOverlay subtree is excluded — otherwise
 * every reverse round would read as a false positive.
 */
function countBrandMagentaLayers(): number {
  const animationOverlay = document.querySelector("[data-animation-overlay]");
  let count = 0;
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    if (animationOverlay?.contains(el)) continue;
    const style = window.getComputedStyle(el);
    if (
      style.backgroundColor.includes("161, 13, 99") ||
      style.backgroundImage.includes("161, 13, 99")
    ) {
      count += 1;
    }
  }
  return count;
}

function readLayoutDebugSnapshot(phase: string): LayoutDebugSnapshot {
  const root = document.documentElement;
  const active = document.activeElement as HTMLElement | null;
  const viewport = window.visualViewport;
  const activeMarker =
    active?.hasAttribute("data-category-blitz-answer-input")
      ? `row-input-${active.getAttribute("data-category-blitz-answer-input")}`
      : active?.closest("[data-category-blitz-answer-list]")
      ? "answer-list-descendant"
      : active?.tagName.toLowerCase() ?? "none";
  const appShell = document.querySelector(".tp-app-shell");
  const gameRootEl = document.querySelector<HTMLElement>("[data-category-blitz-game-root]");
  const gameRootRect = gameRootEl?.getBoundingClientRect() ?? null;
  const visibleFrameEl = document.querySelector<HTMLElement>("[data-category-blitz-visible-frame]");
  const visibleFrameRect = visibleFrameEl?.getBoundingClientRect() ?? null;

  return {
    version: LAYOUT_DEBUG_VERSION,
    phase,
    url: window.location.href,
    activeElement: active?.tagName.toLowerCase() ?? "none",
    activeMarker,
    editorInputCount: document.querySelectorAll("[data-category-blitz-editor-input]").length,
    answerListInputCount: document.querySelectorAll("[data-category-blitz-answer-list] input").length,
    answerRowCount: document.querySelectorAll("[data-category-blitz-answer-row]").length,
    scrollY: Math.round(window.scrollY),
    innerWidth: Math.round(window.innerWidth),
    innerHeight: Math.round(window.innerHeight),
    visualWidth: viewport ? Math.round(viewport.width) : null,
    visualHeight: viewport ? Math.round(viewport.height) : null,
    visualOffsetLeft: viewport ? Math.round(viewport.offsetLeft) : null,
    visualOffsetTop: viewport ? Math.round(viewport.offsetTop) : null,
    bodyOverflow: window.getComputedStyle(document.body).overflow,
    htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
    bodyScrollHeight: document.body.scrollHeight,
    viewportFrame: `${root.style.getPropertyValue("--cbz-visible-left") || "?"}:${root.style.getPropertyValue("--cbz-visible-top") || "?"}:${root.style.getPropertyValue("--cbz-visible-width") || "?"}:${root.style.getPropertyValue("--cbz-visible-height") || "?"}`,
    bodyBackground: window.getComputedStyle(document.body).backgroundColor,
    shellBackground: appShell ? window.getComputedStyle(appShell).backgroundColor : "missing",
    htmlBackground: window.getComputedStyle(document.documentElement).backgroundColor,
    appShellRect: formatRect(appShell),
    mainRect: formatRect(document.querySelector("main")),
    routeRect: formatRect(document.querySelector("[data-category-blitz-play-shell]")),
    rootRect: formatRect(gameRootEl),
    rootRectFull: formatRectFull(gameRootEl),
    frameRectFull: formatRectFull(visibleFrameEl),
    frameTransform: visibleFrameEl ? window.getComputedStyle(visibleFrameEl).transform : "missing",
    editorRect: formatRect(document.querySelector("[data-category-blitz-footer]")),
    gameRect: formatRect(document.querySelector("[data-venue-game-surface]")),
    answerListRect: formatRect(document.querySelector("[data-category-blitz-answer-list]")),
    frameHeightGap:
      visibleFrameRect && viewport ? Math.round(viewport.height - visibleFrameRect.height) : null,
    frameWidthGap:
      visibleFrameRect && viewport ? Math.round(viewport.width - visibleFrameRect.width) : null,
    backdropHeightGap: gameRootRect ? Math.round(window.innerHeight - gameRootRect.height) : null,
    backdropWidthGap: gameRootRect ? Math.round(window.innerWidth - gameRootRect.width) : null,
    row0Transform: readTransform('[data-category-blitz-answer-row="0"]'),
    row0WrapTransform: readTransform('[data-category-blitz-answer-row-wrap="0"]'),
    letterBadgeTransform: readTransform("[data-category-blitz-letter-badge]"),
    projectedRowCount: document.querySelectorAll("[data-category-blitz-row-projected]").length,
    venueTransitionOverlayCount: document.querySelectorAll("[data-venue-transition]").length,
    brandMagentaLayerCount: countBrandMagentaLayers(),
    fixedOverlaysNearBottom: listFixedOverlaysNearBottom(),
  };
}

function readLayoutDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("cbzDebug") === "1" ||
      window.localStorage.getItem("tp:category-blitz-layout-debug") === "1"
    );
  } catch {
    return false;
  }
}

/** Last written frame geometry, so a `visualViewport scroll`/`resize` burst that
 *  reports the same numbers doesn't invalidate the frame's style (and with it the
 *  height, a layout property) once per event during the keyboard animation. */
let lastVisibleFrameSignature = "";

function applyCategoryBlitzVisibleViewportFrame(): void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const left = Math.round(viewport?.offsetLeft ?? 0);
  const top = Math.round(viewport?.offsetTop ?? 0);
  const width = Math.round(viewport?.width ?? window.innerWidth);
  const height = Math.round(viewport?.height ?? window.innerHeight);

  const signature = `${left}:${top}:${width}:${height}`;
  if (signature === lastVisibleFrameSignature) return;
  lastVisibleFrameSignature = signature;

  root.style.setProperty("--cbz-visible-left", `${left}px`);
  root.style.setProperty("--cbz-visible-top", `${top}px`);
  root.style.setProperty("--cbz-visible-width", `${width}px`);
  root.style.setProperty("--cbz-visible-height", `${height}px`);
}

function clearCategoryBlitzVisibleViewportFrame(): void {
  const root = document.documentElement;
  lastVisibleFrameSignature = "";
  root.style.removeProperty("--cbz-visible-left");
  root.style.removeProperty("--cbz-visible-top");
  root.style.removeProperty("--cbz-visible-width");
  root.style.removeProperty("--cbz-visible-height");
}

function useCategoryBlitzVisibleViewportFrame(): void {
  useEffect(() => {
    let rafId: number | null = null;

    const schedule = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyCategoryBlitzVisibleViewportFrame();
      });
    };

    applyCategoryBlitzVisibleViewportFrame();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      clearCategoryBlitzVisibleViewportFrame();
    };
  }, []);
}

function CategoryBlitzLayoutDebugPanel({ phase }: { phase?: CategoryBlitzPhase }) {
  const [enabled] = useState(() => readLayoutDebugEnabled());
  const [snapshot, setSnapshot] = useState<LayoutDebugSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const update = () => setSnapshot(readLayoutDebugSnapshot(phase ?? "unknown"));
    update();

    const intervalId = window.setInterval(update, 500);
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update, { passive: true });
    window.visualViewport?.addEventListener("scroll", update, { passive: true });

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [enabled, phase]);

  if (!enabled || !snapshot) return null;

  return (
    <div
      data-category-blitz-layout-debug
      className="fixed right-2 top-[max(env(safe-area-inset-top),0.5rem)] z-[99999] max-w-[18rem] rounded-lg border border-cyan-300/50 bg-slate-950/90 px-2 py-2 font-mono text-[10px] leading-tight text-cyan-100 shadow-2xl"
    >
      <p>v {snapshot.version}</p>
      <p>phase {snapshot.phase}</p>
      <p>active {snapshot.activeElement}:{snapshot.activeMarker}</p>
      <p>editorInputs {snapshot.editorInputCount} rowInputs {snapshot.answerListInputCount} rows {snapshot.answerRowCount}</p>
      <p>scrollY {snapshot.scrollY} bodyH {snapshot.bodyScrollHeight}</p>
      <p>innerWH {snapshot.innerWidth}x{snapshot.innerHeight} vv {snapshot.visualWidth ?? "n/a"}x{snapshot.visualHeight ?? "n/a"}</p>
      <p>vv xy {snapshot.visualOffsetLeft ?? "n/a"},{snapshot.visualOffsetTop ?? "n/a"}</p>
      {/* Finding F/G: vv minus the VISIBLE FRAME's live rect. A positive heightGap is how
          far the frame stops short of the keyboard; a positive widthGap is a side strip. */}
      <p className={snapshot.frameHeightGap ? "text-rose-300" : undefined}>
        heightGap {snapshot.frameHeightGap ?? "n/a"} widthGap {snapshot.frameWidthGap ?? "n/a"}
      </p>
      {/* Phase 4: innerWH minus the BACKDROP's rect. Unlike the two above, these must be 0
          in EVERY keyboard state — the backdrop is what guarantees a gap shows game-dark
          rather than whatever is beneath the page. Non-zero = the paint guarantee is broken. */}
      <p className={snapshot.backdropHeightGap || snapshot.backdropWidthGap ? "text-rose-300" : undefined}>
        backdropGap h{snapshot.backdropHeightGap ?? "n/a"} w{snapshot.backdropWidthGap ?? "n/a"}
      </p>
      <p>overflow h/b {snapshot.htmlOverflow}/{snapshot.bodyOverflow}</p>
      <p>frame {snapshot.viewportFrame}</p>
      <p>bg h/b/s {snapshot.htmlBackground}/{snapshot.bodyBackground}/{snapshot.shellBackground}</p>
      <p>shell {snapshot.appShellRect}</p>
      <p>main {snapshot.mainRect}</p>
      <p>route {snapshot.routeRect}</p>
      <p>root {snapshot.rootRect}</p>
      <p>rootFull {snapshot.rootRectFull}</p>
      <p>frameFull {snapshot.frameRectFull}</p>
      {/* Phase 4: must be a matrix/matrix3d, never "none" — "none" means the frame fell
          back to layout positioning and is no longer GPU-composited with the keyboard. */}
      <p>frame xf {snapshot.frameTransform}</p>
      <p>editor {snapshot.editorRect}</p>
      <p>game {snapshot.gameRect}</p>
      <p>list {snapshot.answerListRect}</p>
      {/* Finding A: non-"none" transforms here mean Framer Motion's layout projection is
          actively displacing a row/badge outside the reveal morph window. */}
      <p>row0 xf {snapshot.row0Transform}</p>
      <p>row0Wrap xf {snapshot.row0WrapTransform}</p>
      <p>badge xf {snapshot.letterBadgeTransform}</p>
      {/* Phase 2: 0 outside the 450ms reveal morph; 12 means projection is live all round. */}
      <p>projectedRows {snapshot.projectedRowCount}</p>
      <p>venueTransitionOverlays {snapshot.venueTransitionOverlayCount}</p>
      {/* Phase 3: must be 0 — any non-zero value is a live #a10d63 layer on this route. */}
      <p className={snapshot.brandMagentaLayerCount ? "text-rose-300" : undefined}>
        magentaLayers {snapshot.brandMagentaLayerCount}
      </p>
      {snapshot.fixedOverlaysNearBottom.length > 0 ? (
        <div className="mt-1 border-t border-cyan-300/20 pt-1">
          <p>fixed@bottom:</p>
          {snapshot.fixedOverlaysNearBottom.map((label, i) => (
            <p key={i} className="truncate">{label}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  wrong_letter: "wrong letter",
  invalid: "not valid",
  duplicate: "used by another player",
  too_obscure: "only you said this",
  moderated: "flagged",
  pending: "scoring…",
  insufficient_players: "not enough players",
};

/**
 * "Blend In!" (reverse) results card glow — a matched answer glows brighter
 * the more players hit it (docs/category-blitz-mode-b-plan.md Phase 5:
 * "consensus made visible"). `points` is exactly the matching-player count
 * (reverseRoundPoints is the identity function), so it doubles as the glow
 * tier lookup with no separate count needed. Tiers are static Tailwind
 * literals — never interpolated — per lib/themeTokens.ts's scanning rule.
 */
function reverseMatchGlow(points: number): { card: string; badge: string } {
  if (points >= 5) {
    return {
      card: "border-amber-300/70 bg-fuchsia-900/50 shadow-[0_0_22px_rgba(245,158,11,0.55)]",
      badge: "border-amber-300/60 bg-amber-400/20 text-amber-200",
    };
  }
  if (points >= 3) {
    return {
      card: "border-fuchsia-400/60 bg-fuchsia-900/40 shadow-[0_0_14px_rgba(217,70,239,0.4)]",
      badge: "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-200",
    };
  }
  // points === 2 (minimum for "correct" — a match, no glow yet)
  return {
    card: "border-fuchsia-400/40 bg-fuchsia-950/30",
    badge: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
  };
}

// ── Idle / complete screens ───────────────────────────────────────────────────

function formatIdleCountdown(seconds: number): string {
  if (seconds <= 0) return "Starting soon";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

/**
 * Fetch the venue's next scheduled Category Blitz window (or null if none is
 * scheduled), matching the main session hook's testMode param (see
 * lib/categoryBlitzRealtime.ts) so this poll and the hook's poll never
 * disagree on which round-duration regime is active. Shared by the idle
 * lobby's "next game in" countdown and the game-over screen's "next game"
 * messaging (Phase 4) so both read the same field the same way.
 */
async function fetchCategoryBlitzNextWindowAt(venueId: string): Promise<number | null> {
  const testModeParam = isCategoryBlitzTestModeEnabled() ? "&testMode=1" : "";
  try {
    const res = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}${testModeParam}`);
    const json = (await res.json()) as { ok: boolean; nextWindowAt?: string | null };
    return json.nextWindowAt ? new Date(json.nextWindowAt).getTime() : null;
  } catch {
    return null;
  }
}

/**
 * Amber-tinted banner shown when fewer than 3 players are registered for this
 * session. The game works fully (answers are validated, revealed, etc.) but
 * points need 3+ players in standard rounds — reverse ("Majority Rules!")
 * rounds only need 2+ matching answers — see Phase 1 scoring gate.
 */
function InviteBanner({ playerCount }: { playerCount?: number }) {
  if (playerCount === undefined || playerCount > 2) return null;

  const message =
    playerCount === 1
      ? "Playing solo — game works fully, but you need 2+ players to score points. Invite a friend!"
      : `Playing with ${playerCount} friends — you'll score in Majority Rules rounds by matching answers, but other rounds need 3+ players. Invite a friend!`;

  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-center text-[0.65rem] font-semibold leading-snug text-amber-200/90">
      {message}
    </div>
  );
}

/**
 * Compact bullet list of the game's rules (VENUE_GAME_CARD_BY_KEY["category-blitz"].rules),
 * shown underneath the status card so players can review the rules without
 * having to click through the tutorial slides.
 */
function RulesList() {
  const rules = VENUE_GAME_CARD_BY_KEY["category-blitz"].rules.map((rule) => rule.replace(/^\s*-\s*/, "").trim());
  return (
    <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-4`}>
      <p className={`${TEXT_LABEL} mb-2`}>Gameplay</p>
      <div className="space-y-1.5">
        {rules.map((rule, index) => (
          <p key={index} className="text-sm leading-snug text-slate-300">
            • {rule}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Continuous mode has no lobby: the game is always running, players click
 * through the tutorial slides on the venue home screen (shown on every open —
 * that's where the rules live now) and land straight in the game. The only
 * pre-round moment a continuous session can surface is its brief "lobby"
 * status window before a round starts, so this renders as a minimal
 * intermission-style "Next round starts in" beat — no "Waiting for host"
 * copy, no rules list, nothing that reads like a separate waiting room.
 */
function ContinuousWaitScreen({
  lobbyCountdown,
  playerCount,
}: {
  lobbyCountdown: number | null;
  playerCount?: number;
}) {
  const isUrgent = lobbyCountdown != null && lobbyCountdown <= 10;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto overscroll-contain px-4 py-6">
      <InviteBanner playerCount={playerCount} />
      <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-5 text-center`}>
        <p className={TEXT_LABEL}>Next round starts in</p>
        {lobbyCountdown != null ? (
          <p
            className={`mt-1 font-black tabular-nums text-[2.6rem] leading-none ${
              isUrgent ? "animate-pulse text-rose-400" : TEXT_ACCENT
            }`}
          >
            {formatMmSs(lobbyCountdown)}
          </p>
        ) : (
          <p className={`mt-1 animate-pulse text-2xl font-black ${TEXT_ACCENT}`}>Loading categories…</p>
        )}
        <p className="mt-3 text-sm text-emerald-100/80">One letter · 12 categories · 3 minutes</p>
      </div>
    </div>
  );
}

/**
 * Combined pre-game screen for both the "idle" (no active session) and
 * "lobby" (session exists, waiting for host/countdown) phases on the LEGACY
 * SCHEDULED engine only — continuous sessions render ContinuousWaitScreen
 * instead (see the phase-content render below). Shows the rules as a quick
 * reference; the illustrated tutorial slides run before this lobby, as an
 * overlay on the venue home screen (VenueHubClient) — they must not reappear
 * here. The status card up top reflects whichever of the three pre-game
 * states applies: no game scheduled, a scheduled game counting down to its
 * lobby window, or an open lobby counting down to round start.
 */
function LobbyScreen({
  phase,
  venueId,
  username,
  lobbyCountdown,
  playerCount,
  testMode,
}: {
  phase: "idle" | "lobby";
  venueId: string | null;
  username: string | null;
  lobbyCountdown: number | null;
  playerCount?: number;
  testMode: boolean;
}) {
  const [nextWindowAtMs, setNextWindowAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const refetchNextWindow = useCallback(() => {
    if (phase !== "idle" || !venueId) return;
    void fetchCategoryBlitzNextWindowAt(venueId).then((ms) => setNextWindowAtMs(ms));
  }, [phase, venueId]);

  useEffect(() => {
    refetchNextWindow();
  }, [refetchNextWindow]);

  // An admin creating/editing/deleting a schedule broadcasts "schedule_updated"
  // on this venue's session channel (see lib/categoryBlitzSchedules.ts) — refetch
  // immediately instead of leaving this countdown stuck on whatever was
  // scheduled when this screen first mounted.
  const scheduleJustUpdated = useScheduleUpdatedFlash(
    phase === "idle" && venueId ? categoryBlitzChannelName(venueId) : null,
    refetchNextWindow,
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Single continuous target covering both the wait for the schedule window
  // to open AND the lobby dwell after it, so the on-screen countdown never
  // resets partway through. `lobbyCountdown` (from the session hook, once
  // the DB row's `starts_at` is known) is authoritative and takes over the
  // instant it's available; `roundStartAtMs` (computed client-side from the
  // schedule) covers every moment before that, including the entire idle
  // phase where no session row exists yet.
  const roundStartAtMs = nextWindowAtMs != null ? nextWindowAtMs + lobbyDwellSeconds(testMode) * 1000 : null;

  const countdownSeconds =
    lobbyCountdown != null
      ? lobbyCountdown
      : roundStartAtMs != null
        ? Math.max(0, Math.floor((roundStartAtMs - nowMs) / 1000))
        : null;

  const isUrgent = countdownSeconds != null && countdownSeconds <= 10;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overscroll-contain px-4 py-6">
      {phase === "lobby" ? <InviteBanner playerCount={playerCount} /> : null}

      {phase === "lobby" ? (
        <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-5 text-center`}>
          <p className={TEXT_LABEL}>You&apos;re in the lobby</p>
          {username ? <p className="mt-1 text-lg font-bold text-emerald-200">{username}</p> : null}
          {countdownSeconds != null ? (
            <>
              <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Game starts in</p>
              <p
                className={`mt-1 font-black tabular-nums text-[2.6rem] leading-none ${
                  isUrgent ? "animate-pulse text-rose-400" : TEXT_ACCENT
                }`}
              >
                {formatMmSs(countdownSeconds)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xl font-black text-white">Waiting for host</p>
              <p className="mt-2 text-sm text-emerald-100/80">
                The host will start a round shortly. Keep this screen open — the letter and categories will appear automatically.
              </p>
            </>
          )}
          <div className={`mt-4 inline-flex items-center gap-2 rounded-full border ${BORDER_ACTIVE} bg-emerald-950/30 px-3 py-1.5 text-xs font-black uppercase tracking-widest ${TEXT_ACCENT}`}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Ready
          </div>
        </div>
      ) : (
        <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
          <p className={TEXT_LABEL}>Category Blitz</p>
          <div className="mt-2 flex justify-center">
            <ScheduleUpdatedToast show={scheduleJustUpdated} />
          </div>
          {countdownSeconds != null ? (
            <>
              <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Game starts in</p>
              <p className="mt-1 font-black tabular-nums text-emerald-300 text-[2.8rem] leading-none">
                {formatIdleCountdown(countdownSeconds)}
              </p>
              <p className="mt-3 text-sm text-slate-400">One letter · 12 categories · 3 minutes</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xl font-black text-white">No game is running right now.</p>
              <p className="mt-2 text-sm text-slate-400">Check back later for the next session.</p>
            </>
          )}
        </div>
      )}

      <RulesList />
    </div>
  );
}

function ScoringScreen({ mode = "standard" }: { mode?: CategoryBlitzMode }) {
  const theme = GAME_THEME[MODE_CONFIG[mode].themeKey];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border ${theme.borderCard} bg-slate-900/70 p-6 text-center`}>
        <p className={theme.textLabel}>Scoring in progress</p>
        <p className="mt-3 text-xl font-black text-white">Checking answers…</p>
        <p className="mt-2 text-sm text-slate-400">{MODE_CONFIG[mode].rule}</p>
        <div className="mt-4 flex justify-center">
          <div className={`h-6 w-6 animate-spin rounded-full border-2 ${theme.spinnerRing}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * Steps the viewer's venue-wide point TOTAL (users.points — the same number
 * shown on the venue leaderboard) from its pre-session value up to its
 * post-session value, mirroring Speed Trivia's "Total Points" count-up
 * (components/trivia/TriviaGame.tsx ~line 1267). This is deliberately a
 * different number from `viewerEntry.points` in CompleteScreen (that's this
 * session's own cumulative score) — it's the running account total climbing
 * by however much this game just added to it.
 */
function useTotalPointsCountUp(totalBefore: number | null, totalAfter: number | null) {
  const [displayTotal, setDisplayTotal] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (totalBefore === null || totalAfter === null) return;
    setDisplayTotal(totalBefore);
    setPulsing(false);

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
    };

    const diff = totalAfter - totalBefore;
    const DURATION_MS = 800;
    const steps = Math.min(Math.max(Math.abs(diff), 1), 30);
    const stepMs = DURATION_MS / steps;
    // Pause 400ms so the player registers the "before" total, then count up.
    for (let i = 1; i <= steps; i++) {
      schedule(() => {
        const progress = i / steps;
        setDisplayTotal(i === steps ? totalAfter : Math.round(totalBefore + diff * progress));
      }, 400 + stepMs * i);
    }
    schedule(() => setPulsing(true), 400 + DURATION_MS + 80);
    schedule(() => setPulsing(false), 400 + DURATION_MS + 480);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [totalBefore, totalAfter]);

  return { displayTotal, pulsing };
}

/**
 * Final game-over screen: viewer's own score banner, a top-3 podium (plus a
 * pinned rank row if the viewer placed outside it), a stats bar showing
 * final rank + rank movement across the session, and a count-up of the
 * viewer's venue point total climbing by whatever this game just added to
 * it. Modeled on Live Trivia's post-game podium block — see
 * docs/category-blitz-scoring-and-bugfix-plan.md Phase 5.
 */
/**
 * "Next game" messaging shown on the game-over screen: a live countdown to
 * the venue's next scheduled window, or an explicit "nothing scheduled"
 * message. `info === null` means the fetch hasn't resolved yet — render
 * nothing rather than flash an incorrect "no game" before it lands.
 */
function NextGameStatus({ info }: { info: { nextWindowAtMs: number | null } | null }) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!info || info.nextWindowAtMs == null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [info]);

  if (!info) return null;

  const countdownSeconds =
    info.nextWindowAtMs != null ? Math.max(0, Math.floor((info.nextWindowAtMs - nowMs) / 1000)) : null;

  return (
    <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-4 text-center`}>
      <p className={TEXT_LABEL}>Next Game</p>
      {countdownSeconds != null ? (
        <p className="mt-1 font-black tabular-nums text-emerald-300 text-2xl leading-none">
          {formatIdleCountdown(countdownSeconds)}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">No further games are scheduled. Check back later!</p>
      )}
    </div>
  );
}

function CompleteScreen({
  results,
  userId,
  venueId,
  username,
  rankGained,
  venuePointsBefore,
  venuePointsAfter,
  nextWindowInfo,
  isContinuous,
}: {
  results: CategoryBlitzRoundResults | null;
  userId: string;
  venueId: string;
  username: string | null;
  rankGained: number | null;
  /** Viewer's venue-wide point total captured before this session started, or null if unavailable. */
  venuePointsBefore: number | null;
  /** Viewer's venue-wide point total captured once the session completed, or null if unavailable. */
  venuePointsAfter: number | null;
  /** Next scheduled window for this venue, or null while still loading. See NextGameStatus. */
  nextWindowInfo: { nextWindowAtMs: number | null } | null;
  /** True for continuous mode — this screen only shows when an admin manually stops it; there's no schedule to count down to. */
  isContinuous?: boolean;
}) {
  const { displayTotal: totalPointsDisplay, pulsing: totalPointsPulsing } = useTotalPointsCountUp(
    venuePointsBefore,
    venuePointsAfter
  );
  const totalPointsGain =
    venuePointsBefore !== null && venuePointsAfter !== null ? venuePointsAfter - venuePointsBefore : null;
  const standings = (results?.totals ?? []).slice().sort((a, b) => b.points - a.points);

  if (!results || standings.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
          <p className={TEXT_LABEL}>{isContinuous ? "Session ended" : "Game over"}</p>
          <p className="mt-3 text-xl font-black text-white">The session has ended.</p>
          <p className="mt-2 text-sm text-slate-400">Thanks for playing!</p>
        </div>
        {/* Continuous mode has no schedule to count down to — omit the scheduled "next game" card. */}
        {!isContinuous && <NextGameStatus info={nextWindowInfo} />}
      </div>
    );
  }

  const viewerRank = standings.findIndex((t) => t.userId === userId);
  const viewerEntry = viewerRank > -1 ? standings[viewerRank] : null;
  const viewerInPodium = viewerRank > -1 && viewerRank < 3;
  const podium = standings.slice(0, 3).map((entry, i) => ({ ...entry, rank: i + 1 }));
  const podiumOrder = [podium[1], podium[0], podium[2]];
  const viewerAnswers = results.results
    .map((category) => category.answers.find((answer) => answer.userId === userId) ?? null)
    .filter((answer): answer is NonNullable<typeof answer> => answer !== null);
  const correctAnswers = viewerAnswers.filter((answer) => answer.reason === "correct").length;
  const correctRate = viewerAnswers.length > 0 ? Math.round((correctAnswers / viewerAnswers.length) * 100) : null;
  const storySharePayload = viewerEntry
    ? buildCategoryBlitzStorySharePayload({
        venueId: venueId || "unknown-venue",
        venueName: null,
        userId: userId || "unknown-user",
        username: viewerEntry.username || username || "Player",
        finalRank: viewerRank + 1,
        finalPoints: viewerEntry.points,
        correctRate,
        isChampion: viewerRank === 0,
      })
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-6">
      {/* Viewer's own final score */}
      <div className={`flex items-center gap-3 rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 px-4 py-4`}>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${LETTER_GRADIENT}`}>
          <span className="text-2xl leading-none">🏁</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={TEXT_LABEL}>
            {isContinuous
              ? viewerRank === 0
                ? "Session Complete · Champion"
                : "Session Complete"
              : viewerRank === 0
              ? "Game Over · Champion"
              : "Game Over"}
          </p>
          <p className="truncate text-lg font-black leading-tight text-white">{viewerEntry?.username ?? "You"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-3xl font-black tabular-nums leading-none ${TEXT_ACCENT}`}>
            {viewerEntry?.points ?? 0}
          </p>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600/80">Points</p>
        </div>
      </div>

      {/* Final standings podium */}
      <div className={`rounded-2xl border ${BORDER_CARD} bg-slate-900/70 px-4 py-4`}>
        <p className={`${TEXT_LABEL} mb-3`}>Final Standings</p>
        <div className="flex items-end justify-center gap-2">
          {podiumOrder.map((entry, slot) => {
            if (!entry) return <div key={`empty-${slot}`} className="flex-1" />;
            const isMe = entry.userId === userId;
            const cardClass =
              entry.rank === 1
                ? "min-h-36 border-emerald-400/60 bg-emerald-500/15"
                : entry.rank === 2
                ? "min-h-28 border-slate-600 bg-slate-800/50"
                : "min-h-24 border-slate-700 bg-slate-800/30";
            return (
              <div
                key={entry.userId}
                className={`flex flex-1 flex-col items-center justify-end gap-1.5 rounded-xl border px-2 pb-3 pt-3 text-center ${cardClass} ${
                  isMe ? "ring-2 ring-emerald-400" : ""
                }`}
              >
                <RankBadge rank={entry.rank} />
                <p className="w-full truncate text-xs font-bold text-slate-100">
                  {entry.username}
                  {isMe && <span className="ml-1 text-[9px] font-black uppercase text-emerald-400/80">you</span>}
                </p>
                <p className="text-lg font-black tabular-nums text-white">{entry.points}</p>
              </div>
            );
          })}
        </div>

        {!viewerInPodium && viewerEntry && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2.5">
            <RankBadge rank={viewerRank + 1} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-emerald-100">
              {viewerEntry.username}
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400/70">you</span>
            </span>
            <span className="shrink-0 text-base font-black tabular-nums text-white">{viewerEntry.points}</span>
          </div>
        )}
      </div>

      {/* Stats bar: final rank + rank movement across the session */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center rounded-2xl border border-emerald-400/30 bg-emerald-600/15 py-3">
          <span className="text-xl font-black tabular-nums text-emerald-300">
            {rankGained != null
              ? rankGained > 0
                ? `▲ ${rankGained}`
                : rankGained < 0
                ? `▼ ${Math.abs(rankGained)}`
                : "—"
              : "—"}
          </span>
          <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">Rank Gained</span>
        </div>
        <div className="flex flex-col items-center rounded-2xl border border-cyan-400/30 bg-cyan-600/15 py-3">
          <span className="text-xl font-black tabular-nums text-cyan-300">
            {viewerRank > -1 ? `#${viewerRank + 1}` : "—"}
          </span>
          <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-600">Final Rank</span>
        </div>
      </div>

      {/* Venue point total count-up — mirrors Speed Trivia's "Total Points" card */}
      {totalPointsDisplay !== null && (
        <div
          className={`rounded-2xl border-2 bg-emerald-500/10 px-4 py-3 text-center transition-all duration-300 ${
            totalPointsPulsing ? "border-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.35)]" : BORDER_ACTIVE
          }`}
        >
          <p className={TEXT_LABEL}>Your Total Points</p>
          <p
            className={`mt-1 font-black tabular-nums text-3xl leading-none transition-transform duration-150 ${TEXT_ACCENT} ${
              totalPointsPulsing ? "scale-110" : "scale-100"
            }`}
          >
            {totalPointsDisplay}
          </p>
          {totalPointsGain !== null && (
            <p className="mt-0.5 text-xs text-slate-400">+{totalPointsGain} this game</p>
          )}
        </div>
      )}

      {storySharePayload ? (
        <StoryShareLauncher
          payload={storySharePayload}
          title={viewerRank === 0 ? "Share the champion shot" : "Share your blitz run"}
          buttonLabel="Create story"
          className="border-emerald-300/30 bg-emerald-300/[0.08]"
        />
      ) : null}

      {!isContinuous && <NextGameStatus info={nextWindowInfo} />}

      <p className="pb-2 text-center text-xs text-slate-500">Thanks for playing! Your points have been awarded.</p>
    </div>
  );
}

// ── Results screen ────────────────────────────────────────────────────────────

function ResultsScreen({
  results,
  userId,
  nextRoundStartsIn,
  playerCount,
  leaderboardExiting = false,
}: {
  results: CategoryBlitzRoundResults;
  userId: string;
  nextRoundStartsIn: number | null;
  playerCount?: number;
  leaderboardExiting?: boolean;
}) {
  const standings = results.totals.slice().sort((a, b) => b.points - a.points);
  const top10 = standings.slice(0, 10);
  const viewerRank = standings.findIndex((t) => t.userId === userId);
  const viewerInTop10 = viewerRank > -1 && viewerRank < 10;
  const viewerEntry = viewerRank > -1 ? standings[viewerRank] : null;
  const isReverse = results.mode === "reverse";
  const theme = GAME_THEME[MODE_CONFIG[results.mode].themeKey];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
      <InviteBanner playerCount={playerCount} />
      {/* The reveal journey (RevealSequence) just animated the leaderboard a
          beat earlier, then settled here — so the countdown "drops in" above a
          leaderboard that's already at rest (settled: no replayed count-up). */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE_SNAP }}
      >
        <IntermissionStatus nextRoundStartsIn={nextRoundStartsIn} />
      </motion.div>

      {/* Live Leaderboard — rendered settled so it doesn't replay the count-up /
          reorder it just performed inside RevealSequence. */}
      <div className={`rounded-2xl border-2 ${theme.borderActive} ${theme.bgTint} p-4`}>
        <p className={`${theme.textLabel} text-center`}>Leaderboard</p>
        <div className="mt-3">
          <LiveLeaderboard entries={results.totals} meId={userId} exiting={leaderboardExiting} settled />
        </div>
      </div>

      {/* Category breakdown — kept underneath the leaderboard */}
      <p className={`${theme.textLabel} mt-1`}>Letter: {results.letter}</p>
      <div className="space-y-2">
        {results.results.map((cat) => {
          const viewerAnswer = cat.answers.find((a) => a.userId === userId);
          const reason = viewerAnswer?.reason;
          // Reverse "correct" (matched the crowd) glows brighter the more
          // players hit it — consensus made visible (Phase 5). Standard mode
          // and every other reason keep the flat per-reason card look.
          const glow = isReverse && reason === "correct" && viewerAnswer
            ? reverseMatchGlow(viewerAnswer.pointsAwarded)
            : null;
          return (
            <div
              key={cat.categoryIndex}
              className={`rounded-xl border ${
                glow
                  ? glow.card
                  : reason === "correct"
                  ? "border-emerald-400/50 bg-emerald-950/40"
                  : reason === "too_obscure"
                  ? "border-slate-600 bg-slate-800/40"
                  : reason === "wrong_letter" || reason === "invalid" || reason === "moderated"
                  ? "border-rose-500/50 bg-rose-950/30"
                  : reason === "insufficient_players"
                  ? "border-amber-400/50 bg-amber-950/40"
                  : viewerAnswer
                  ? "border-slate-600 bg-slate-800/40"
                  : "border-slate-700/50 bg-slate-900/30"
              } p-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">
                    {cat.category}
                  </p>
                  {viewerAnswer ? (
                    <p className={`mt-0.5 truncate text-sm font-bold ${
                      reason === "correct"
                        ? (isReverse ? "text-fuchsia-200" : "text-emerald-300")
                        : reason === "too_obscure"
                        ? "text-slate-300"
                        : reason === "wrong_letter" || reason === "invalid" || reason === "moderated"
                        ? "text-rose-400"
                        : reason === "insufficient_players"
                        ? "text-amber-300"
                        : "text-slate-400"
                    }`}>
                      {viewerAnswer.answer || <span className="italic opacity-50">no answer</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-slate-600">no answer</p>
                  )}
                  {viewerAnswer && reason && reason !== "correct" ? (
                    <div>
                      <p className={`mt-0.5 text-[0.65rem] font-semibold ${
                        reason === "insufficient_players"
                          ? "text-amber-300/80"
                          : reason === "too_obscure"
                          ? "text-slate-400"
                          : "text-rose-300/80"
                      }`}>
                        {REASON_LABEL[reason] ?? reason}
                      </p>
                      {viewerAnswer.explanation && (
                        <p className="mt-0.5 text-[0.6rem] leading-snug text-slate-500">
                          {viewerAnswer.explanation}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {reason === "correct" ? (
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[0.65rem] font-black ${
                      glow ? glow.badge : "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                    }`}>
                      +{viewerAnswer?.pointsAwarded ?? 0}
                    </span>
                  ) : reason === "too_obscure" ? (
                    <span className="inline-flex items-center rounded-md border border-slate-600 bg-slate-700/30 px-2 py-0.5 text-[0.65rem] font-black text-slate-300">
                      +{viewerAnswer?.pointsAwarded ?? 0}
                    </span>
                  ) : reason === "wrong_letter" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      wrong letter
                    </span>
                  ) : reason === "invalid" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      invalid
                    </span>
                  ) : reason === "moderated" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      flagged
                    </span>
                  ) : reason === "duplicate" ? (
                    <span className="text-[0.65rem] font-black text-slate-500">dup</span>
                  ) : reason === "insufficient_players" ? (
                    <span className="inline-flex items-center rounded-md border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-black text-amber-300">
                      no contest
                    </span>
                  ) : null}
                </div>
              </div>
              {/* Other answers */}
              {cat.answers.filter((a) => a.userId !== userId).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cat.answers
                    .filter((a) => a.userId !== userId)
                    .map((a) => (
                      <span
                        key={a.userId}
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${
                          a.isUnique
                            ? (isReverse ? "border-fuchsia-700/50 text-fuchsia-400/70" : "border-emerald-700/50 text-emerald-400/70")
                            : "border-slate-700 text-slate-600"
                        }`}
                      >
                        {a.answer}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Answering screen ──────────────────────────────────────────────────────────

type SubmitState = "idle" | "submitting" | "done" | "error";

/** Debounce delay before an in-progress answer is autosaved to the server. */
const AUTOSAVE_DEBOUNCE_MS = 600;

/** How long `visualViewport` must be quiet before the answer-list scroll correction is
 *  considered safe to run. The iOS keyboard animates in over ~250 ms and fires `resize`
 *  throughout; correcting on each one is what produced the pre-Phase-4 stack of up to six
 *  overlapping `smooth` scrolls per tap. One correction, once the viewport stops moving. */
const VIEWPORT_SETTLE_MS = 120;

/** Fallback deadline for that correction when no `visualViewport resize` ever arrives —
 *  the keyboard was already open, the platform has no software keyboard, or iOS refused
 *  the focus. Long enough that a slow keyboard's first resize still pre-empts it. */
const VIEWPORT_SETTLE_FALLBACK_MS = 400;

type AnswerRowTheme = (typeof GAME_THEME)[CategoryBlitzThemeKey];

interface AnswerRowProps {
  index: number;
  category: string;
  letter: string;
  answer: string;
  isActive: boolean;
  disabled: boolean;
  theme: AnswerRowTheme;
  activeRingClass: string;
  /** True for the last row — drives the keyboard's Return key hint (done vs next). */
  isLast: boolean;
  /** Row input gained focus. Records the active row; does NOT re-focus (that
   *  would loop through this same handler). */
  onActivate: (index: number) => void;
  /** Row input lost focus. Debounced by the parent, since moving between two
   *  row inputs blurs one before focusing the next. */
  onDeactivate: () => void;
  onChange: (index: number, value: string) => void;
  /** Return/Enter pressed — advance to the next row, or dismiss on the last. */
  onSubmitRow: (index: number) => void;
}

/**
 * A single answer row, split out of `AnsweringScreen` and memoized so a
 * once-a-second `timeRemaining` tick (or the root's 4 Hz reveal-timing tick,
 * see `AnsweringScreen`'s own memo wrapper below) re-renders the header, not
 * all twelve rows. `answer`/`isActive`/`disabled` are the only things that
 * ever change per row; `theme`/`onActivate` are stable references across a
 * round (see the app-feel plan, Phase 6).
 */
const AnswerRow = memo(function AnswerRow({
  index,
  category,
  letter,
  answer,
  isActive,
  disabled,
  theme,
  activeRingClass,
  isLast,
  onActivate,
  onDeactivate,
  onChange,
  onSubmitRow,
}: AnswerRowProps) {
  const filled = answer.trim().length > 0;
  const wrongLetter = filled && !answerStartsWithLetter(answer, letter);
  const isValid = filled && !wrongLetter;

  // ValidAnswerGlow used to be `key={answer}`, remounting its checkmark-pop
  // animation on every keystroke while the row stayed valid. Replay it only
  // on the transition INTO a valid state instead. Adjusted directly during
  // render (React's documented "storing information from previous renders"
  // pattern) rather than in an effect, so the token bump and the render it
  // affects land in the same commit instead of triggering an extra one.
  const [glowToken, setGlowToken] = useState(0);
  const [prevIsValid, setPrevIsValid] = useState(isValid);
  if (isValid !== prevIsValid) {
    setPrevIsValid(isValid);
    if (isValid) setGlowToken((t) => t + 1);
  }

  // Same fix for WrongLetterReject's shake: it used to replay on every
  // keystroke that kept the answer wrong-letter (shakeToken was the raw,
  // ever-changing answer string). Fire it once on the transition INTO
  // wrong-letter instead.
  const [wrongToken, setWrongToken] = useState(0);
  const [prevWrongLetter, setPrevWrongLetter] = useState(wrongLetter);
  if (wrongLetter !== prevWrongLetter) {
    setPrevWrongLetter(wrongLetter);
    if (wrongLetter) setWrongToken((t) => t + 1);
  }

  const inputRow = (
    // A <label>, not a <button>: the row owns a real <input>, and a label
    // forwards the tap to its own control natively and synchronously inside the
    // gesture — which is exactly what iOS requires to open the keyboard (the
    // rule Phase 4 established). No `onPointerDown`/`preventDefault` here: that
    // pair existed to stop a tap from blurring the old shared editor, and it
    // would now cancel the native focus we actually want.
    <label
      data-category-blitz-answer-row={index}
      className={`relative flex w-full items-center gap-2 rounded-xl border text-left transition-colors ${
        disabled ? "opacity-60" : "cursor-text"
      } ${
        wrongLetter
          ? "border-rose-500/70 bg-rose-950/30"
          : isActive
          ? `${theme.filledBorder} ${theme.filledBg} ring-2 ${activeRingClass}`
          : filled
          ? `${theme.filledBorder} ${theme.filledBg}`
          : "border-slate-700/60 bg-slate-900/40"
      } px-3 py-2`}
    >
      {/* Valid answer glow + checkmark pop feedback */}
      {isValid ? <ValidAnswerGlow key={glowToken} /> : null}
      <span className="w-5 shrink-0 text-center text-[0.65rem] font-black text-slate-500">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-black uppercase tracking-widest text-slate-400">
          {category}
        </p>
        <input
          data-category-blitz-answer-input={index}
          type="text"
          value={answer}
          disabled={disabled}
          onChange={(event) => onChange(index, event.target.value)}
          onFocus={() => onActivate(index)}
          onBlur={onDeactivate}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmitRow(index);
          }}
          // `text-base` = 16px. Do not shrink this: iOS Safari zooms the whole
          // page in on focus for any text input under 16px, which would look
          // exactly like the layout corruption this plan spent six rounds
          // chasing (docs/category-blitz-app-feel-plan.md, Phase 6). The old
          // display <p> was `text-sm` (14px) and could afford to be — a real
          // input here cannot.
          // The `!` overrides are load-bearing, not stylistic. Two GLOBAL rules
          // in app/globals.css apply to every `input` in the app with
          // `!important`: a `min-height: 36px` inside the mobile media query,
          // and a `1px solid #334155` border + `border-radius: 12px`. Both are
          // right for a normal form field and wrong for twelve of them stacked
          // in a keyboard-open game board — the min-height alone costs 12px per
          // row (two whole answer rows of visible list), and the border draws a
          // second box inside the row's own border. Overridden here only, on
          // this input; the global rules are untouched for the rest of the app.
          // `h-6 leading-6 p-0` then pins the box to exactly its 24px line box.
          // `focus:!shadow-none` kills a third global rule — the app-wide cyan
          // focus ring on `input:focus`. The ROW already shows focus (its own
          // `ring-2` + border), so the input's ring drew a second rounded box
          // nested inside the row: visually the very "duplicate field" this
          // change exists to remove.
          className={`mt-0.5 h-6 !min-h-0 w-full truncate !border-0 bg-transparent p-0 text-base font-bold leading-6 outline-none placeholder:text-slate-600 focus:!shadow-none ${
            wrongLetter ? "text-rose-300" : filled ? theme.filledText : "text-white"
          }`}
          placeholder={`${letter}...`}
          aria-label={`${category} — answer starting with ${letter}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint={isLast ? "done" : "next"}
        />
      </div>
      {wrongLetter && (
        <span className="shrink-0 text-[0.6rem] font-black uppercase tracking-widest text-rose-400">
          wrong letter
        </span>
      )}
    </label>
  );

  return (
    <WrongLetterReject shakeToken={wrongLetter ? String(wrongToken) : null}>
      {inputRow}
    </WrongLetterReject>
  );
});
AnswerRow.displayName = "AnswerRow";

interface AnsweringScreenProps {
  letter: string;
  categories: string[];
  roundId: string;
  timeRemaining: number;
  venueId: string;
  userId: string;
  playerCount?: number;
  /** Round mode — flips the whole board's accent/background to the "Blend In!"
   *  color world for the round's duration. Defaults to "standard" so callers
   *  mid-migration (or a round with no mode yet) render the familiar look. */
  mode?: CategoryBlitzMode;
  /** True when this screen is mounting directly out of RoundStartReveal, i.e.
   *  there are live `layoutId` partners on screen to FLIP from. Only then does
   *  the board render with layout projection at all (see `morphActive`).
   *  Defaults to false: a mid-round reload never showed the reveal, so it has
   *  nothing to morph from and should go straight to plain rows. */
  morphFromReveal?: boolean;
  /** Called with `true` while a row is being typed into, so the root can drop
   *  its own chrome (the Back bar) for the duration. See `compactChrome`. */
  onEditingChange?: (editing: boolean) => void;
}

/**
 * Memoized so the root's 4 Hz reveal-timing tick and the per-second
 * `timeRemaining` tick don't rebuild this screen (and its 12 rows) unless a
 * prop it actually cares about changed — see AnswerRow above and the app-feel
 * plan, Phase 6. `categories`/`round.mode` are stable references from
 * `useCategoryBlitzSession` (only replaced by an actual round change), so the
 * default shallow prop comparison is sufficient; no custom comparator needed.
 */
export const AnsweringScreen = memo(function AnsweringScreen({
  letter,
  categories,
  roundId,
  timeRemaining,
  venueId,
  userId,
  playerCount,
  mode = "standard",
  morphFromReveal = false,
  onEditingChange,
}: AnsweringScreenProps) {
  const theme = GAME_THEME[MODE_CONFIG[mode].themeKey];
  const activeRingClass = mode === "reverse" ? "ring-fuchsia-300/55" : "ring-emerald-300/55";
  const venuePresence = useVenuePresence();
  const [answers, setAnswers] = useState<string[]>(() => Array(12).fill(""));
  const [activeAnswerIndex, setActiveAnswerIndex] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const submittedRef = useRef(false);
  const timerWasZeroRef = useRef(false);
  const activeAnswerIndexRef = useRef<number | null>(null);
  const answerListRef = useRef<HTMLDivElement | null>(null);
  // Per-category debounce timers + last-autosaved value, so a slow network or
  // dropped tab doesn't lose an answer that was typed but never manually
  // submitted — each field autosaves shortly after the user stops typing,
  // reusing the same per-category upsert the final submit already uses.
  const autosaveTimersRef = useRef<Array<number | null>>(Array(12).fill(null));
  const lastAutosavedRef = useRef<string[]>(Array(12).fill(""));

  // Framer Motion layout projection is only needed for the 450 ms reveal →
  // gameplay FLIP. Left in place it costs the entire round: every element with
  // a `layoutId` keeps a live projection node that Framer re-measures and
  // animates — with per-node translate AND scale correction — on ANY viewport
  // resize. The iOS keyboard opening IS a viewport resize, so twelve rows plus
  // the header badge were re-projecting on every single tap of an answer row,
  // mid-round, for three minutes (docs/category-blitz-app-feel-plan.md,
  // Finding A). Scope it to the window it was designed for: `morphActive` is
  // true only from mount until the morph settles, then permanently false, and
  // while false the rows/badge render as plain elements with no projection
  // node at all. Never flips back on — a round only morphs in once.
  const [morphActive, setMorphActive] = useState(morphFromReveal);
  useEffect(() => {
    if (!morphActive) return;
    const id = window.setTimeout(() => setMorphActive(false), LAYOUT_MORPH_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [morphActive]);

  // With the iOS keyboard open the visible viewport is roughly half the screen
  // (~410 CSS px on an iPhone 16 Pro). Phase 8's device capture showed the
  // chrome above and below the answer list eating ~180 px of that, leaving only
  // 2–3 answer rows visible against an acceptance target of 5+. While a row is
  // actually being typed into, none of that chrome is what the player is
  // looking at: `compactChrome` yields it to the list — the Back bar and the
  // invite banner unmount, the header keeps only the letter + timer + progress,
  // and the editor drops its helper line and slims its padding. Everything
  // comes straight back when the keyboard closes.
  //
  // Gated on `!morphActive` so the round-start FLIP always measures the letter
  // badge at its full size: the badge is a shared-layoutId morph target, and
  // resizing it mid-projection is exactly the kind of stale-rect tear Phase 2
  // scoped the projection away from. In practice the two never overlap (nothing
  // is focused during the 570 ms morph window), so this is belt-and-suspenders.
  const compactChrome = activeAnswerIndex !== null && !morphActive;

  // The Back bar lives in the root component, above this screen, so it needs to
  // be told. Reset on unmount so leaving the answering phase mid-type (round
  // expiry, a reveal cutting in) can never strand the root without its chrome.
  useEffect(() => {
    onEditingChange?.(compactChrome);
  }, [compactChrome, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  const isExpired = timeRemaining <= 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 30;
  const totalFilled = answers.filter((a) => a.trim().length > 0).length;

  const autosaveAnswer = useCallback(
    (categoryIndex: number, answer: string) => {
      if (venuePresence.isInteractionBlocked || !answer || lastAutosavedRef.current[categoryIndex] === answer) return;
      lastAutosavedRef.current[categoryIndex] = answer;
      void fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as unknown;
          venuePresence.capturePresenceFailure(payload);
        })
        .catch(() => {
          // Best-effort — if this fails, the final submit-on-expiry resends
          // every filled category anyway, so nothing is silently lost.
        });
    },
    [roundId, venueId, userId, venuePresence]
  );

  useEffect(() => {
    const timers = autosaveTimersRef.current;
    return () => {
      for (const t of timers) if (t !== null) window.clearTimeout(t);
    };
  }, []);

  const updateAnswer = useCallback(
    (categoryIndex: number, value: string) => {
      setAnswers((current) => {
        const next = [...current];
        next[categoryIndex] = value;
        return next;
      });

      const timers = autosaveTimersRef.current;
      if (timers[categoryIndex] !== null) window.clearTimeout(timers[categoryIndex]!);
      const trimmed = value.trim();
      timers[categoryIndex] = window.setTimeout(() => {
        timers[categoryIndex] = null;
        autosaveAnswer(categoryIndex, trimmed);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [autosaveAnswer]
  );

  // Mobile Safari is most reliable when the active text control is a normal,
  // visible field in the same layout flow as the answer list. The rows below
  // remain display controls; this single editor owns text entry for whichever
  // row is active.
  const scrollFocusCleanupRef = useRef<(() => void) | null>(null);

  const scrollAnswerIntoView = useCallback((categoryIndex: number, behavior: ScrollBehavior) => {
    const list = answerListRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-category-blitz-answer-row="${categoryIndex}"]`);
    if (!list) return;
    if (!row) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const visibleTop = Math.max(listRect.top, viewportTop) + 12;
    const visibleBottom = Math.min(listRect.bottom, viewportBottom) - 16;

    let delta = 0;
    if (rowRect.bottom > visibleBottom) {
      delta = rowRect.bottom - visibleBottom;
    } else if (rowRect.top < visibleTop) {
      delta = rowRect.top - visibleTop;
    }

    if (Math.abs(delta) < 1) return;
    list.scrollBy({ top: delta, behavior });
  }, []);

  /**
   * Bring `categoryIndex` into view inside the answer list with EXACTLY ONE scroll,
   * and return a canceller. Pre-Phase-4 this was a stack of four timers (0/40/220/420 ms)
   * plus a one-shot `visualViewport resize` listener that scheduled two more `smooth`
   * scrolls — up to six overlapping animated scrolls per tap, all running straight through
   * the keyboard's own animation. Competing smooth scrolls during a keyboard animation
   * cannot look like an app.
   *
   * `keyboardAlreadyOpen` splits the two real cases: taps 2..12 of a round change nothing
   * about the viewport, so waiting would just feel laggy — correct immediately. The first
   * tap opens the keyboard, so wait for `visualViewport` to stop moving and correct once
   * against the geometry the user will actually see. `behavior: "auto"` throughout, on
   * purpose.
   */
  const scheduleAnswerScroll = useCallback(
    (categoryIndex: number, keyboardAlreadyOpen: boolean): (() => void) => {
      const viewport = window.visualViewport;
      let timer: number | null = null;
      let resizeHandler: (() => void) | null = null;

      const stop = () => {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        if (resizeHandler) {
          viewport?.removeEventListener("resize", resizeHandler);
          resizeHandler = null;
        }
      };
      const correctNow = () => {
        stop();
        scrollAnswerIntoView(categoryIndex, "auto");
      };

      // Each resize during the keyboard's open animation pushes the correction out; it
      // lands once the viewport has held still for VIEWPORT_SETTLE_MS.
      resizeHandler = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(correctNow, VIEWPORT_SETTLE_MS);
      };
      viewport?.addEventListener("resize", resizeHandler, { passive: true });

      if (keyboardAlreadyOpen) {
        scrollAnswerIntoView(categoryIndex, "auto");
        // Keep listening briefly anyway: the keyboard can still change height under us
        // (autocorrect bar, emoji keyboard, a hardware keyboard attaching), which would
        // move the row we just brought into view.
        timer = window.setTimeout(stop, VIEWPORT_SETTLE_FALLBACK_MS);
      } else {
        timer = window.setTimeout(correctNow, VIEWPORT_SETTLE_FALLBACK_MS);
      }

      return stop;
    },
    [scrollAnswerIntoView]
  );

  /**
   * A row input reported focus. Every path into an active row lands here — a tap
   * (which the <label> forwards to its own input natively, synchronously inside
   * the gesture, exactly as Phase 4 requires) and the programmatic Return-key
   * advance below alike. It must NOT call `.focus()` itself: it runs *from* the
   * focus event, so doing so would loop.
   */
  const handleRowFocus = useCallback((categoryIndex: number) => {
    scrollFocusCleanupRef.current?.();
    const keyboardAlreadyOpen = activeAnswerIndexRef.current !== null;
    activeAnswerIndexRef.current = categoryIndex;
    setActiveAnswerIndex(categoryIndex);
    scrollFocusCleanupRef.current = scheduleAnswerScroll(categoryIndex, keyboardAlreadyOpen);
  }, [scheduleAnswerScroll]);

  /**
   * Debounced: moving between two rows blurs the old input before focusing the
   * new one, so an undebounced blur would flicker the chrome back open (and,
   * pre-`compactChrome`, resize the whole board) between every pair of taps.
   */
  const handleRowBlur = useCallback(() => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.hasAttribute("data-category-blitz-answer-input")) {
        return;
      }
      activeAnswerIndexRef.current = null;
      setActiveAnswerIndex(null);
    }, 80);
  }, []);

  /** Programmatic focus, by row index — the Return-key advance. Queries the DOM
   *  rather than threading twelve refs through a memoized row component. */
  const focusAnswerRow = useCallback((categoryIndex: number) => {
    if (isExpired || submitState !== "idle") return;
    const input = answerListRef.current?.querySelector<HTMLInputElement>(
      `[data-category-blitz-answer-input="${categoryIndex}"]`
    );
    // `preventScroll` keeps Safari from running its own scroll-into-view — the
    // answer list owns that, and the page must never scroll.
    input?.focus({ preventScroll: true });
  }, [isExpired, submitState]);

  /** Return/Enter on a row: advance to the next one, or close the keyboard on
   *  the last (matching the `enterKeyHint` the row advertises). */
  const handleRowSubmit = useCallback((categoryIndex: number) => {
    const nextIndex = categoryIndex + 1;
    if (nextIndex >= categories.length) {
      const input = answerListRef.current?.querySelector<HTMLInputElement>(
        `[data-category-blitz-answer-input="${categoryIndex}"]`
      );
      input?.blur();
      return;
    }
    focusAnswerRow(nextIndex);
  }, [categories.length, focusAnswerRow]);

  useEffect(() => {
    return () => {
      scrollFocusCleanupRef.current?.();
    };
  }, []);

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current || venuePresence.isInteractionBlocked) return;
    submittedRef.current = true;
    setSubmitState("submitting");
    setErrorMsg("");

    const timers = autosaveTimersRef.current;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] !== null) {
        window.clearTimeout(timers[i]!);
        timers[i] = null;
      }
    }

    try {
      const filled = answers
        .map((a, i) => ({ categoryIndex: i, answer: a.trim() }))
        .filter((e) => e.answer.length > 0);

      const responses = await Promise.all(
        filled.map(({ categoryIndex, answer }) =>
          fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
          })
        )
      );
      for (const response of responses) {
        const payload = (await response.json().catch(() => null)) as unknown;
        const presenceFailure = venuePresence.capturePresenceFailure(payload);
        if (presenceFailure) {
          throw new Error(presenceFailure.userMessage);
        }
        if (!response.ok) {
          throw new Error("Submission failed.");
        }
      }
      setSubmitState("done");
    } catch (error) {
      submittedRef.current = false;
      setSubmitState("error");
      setErrorMsg(error instanceof Error ? error.message : "Submission failed. Please try again.");
    }
  }, [answers, roundId, venueId, userId, venuePresence]);

  const submitAnswersRef = useRef(submitAnswers);

  useEffect(() => {
    submitAnswersRef.current = submitAnswers;
  });

  // Auto-submit when timer hits zero — deferred so the effect doesn't trigger cascading state updates.
  useEffect(() => {
    if (!isExpired || timerWasZeroRef.current || submitState !== "idle" || venuePresence.isInteractionBlocked) return;
    timerWasZeroRef.current = true;
    // Close the keyboard on expiry, whichever row currently owns it.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.hasAttribute("data-category-blitz-answer-input")) {
      focused.blur();
    }
    const t = window.setTimeout(() => { void submitAnswersRef.current(); }, 0);
    return () => window.clearTimeout(t);
  }, [isExpired, submitState, venuePresence.isInteractionBlocked]);

  if (submitState === "done") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border-2 ${theme.borderActive} ${theme.bgTint} p-6 text-center`}>
          <p className={theme.textLabel}>Answers submitted</p>
          <p className="mt-3 text-xl font-black text-white">
            {totalFilled === 0 ? "No answers recorded." : `${totalFilled} answer${totalFilled !== 1 ? "s" : ""} submitted!`}
          </p>
          <p className={`mt-2 text-sm ${theme.textSoft}`}>Waiting for scoring…</p>
          <div className="mt-4 flex justify-center">
            <div className={`h-5 w-5 animate-spin rounded-full border-2 ${theme.spinnerRing}`} />
          </div>
        </div>
      </div>
    );
  }

  // Badge markup is shared between the projected (morphing) and plain forms so
  // the swap at the end of the morph window is a pure element-type change with
  // identical geometry — nothing moves when the projection node goes away.
  const letterBadgeClassName = `flex shrink-0 items-center justify-center rounded-2xl ${
    compactChrome ? "h-9 w-9" : "h-14 w-14"
  } ${theme.letterGradient} ${theme.letterGlow}`;
  const letterBadgeGlyph = (
    <span
      className={`font-['Bree_Serif',_Nunito,_serif] font-black leading-none text-slate-950 ${
        compactChrome ? "text-2xl" : "text-4xl"
      }`}
    >
      {letter}
    </span>
  );

  return (
    <div
      className="relative grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden"
      // Present only while the keyboard-open chrome reduction is active, so the
      // mobile-shell harness can assert both states directly instead of
      // inferring them from rects.
      data-category-blitz-compact-chrome={compactChrome ? "" : undefined}
    >
      {submitState === "submitting" && (
        <SubmitLockAnimation answersCount={totalFilled} />
      )}
      {compactChrome ? null : (
        <motion.div
          className="shrink-0 px-4 pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CHROME_ENTRANCE_TRANSITION}
        >
          <InviteBanner playerCount={playerCount} />
        </motion.div>
      )}
      {/* Sticky header — its bar (border/background/position) stays static so
          it doesn't shift the badge's projected target mid-morph; only the
          content INSIDE it (label, timer, progress) fades in, staggered
          slightly behind the badge/row morph so the handoff reads as one
          sequenced beat rather than shared elements morphing while
          everything else pops in instantly. */}
      <div
        className={`shrink-0 border-b ${theme.borderActive} bg-slate-950/90 px-4 ${
          compactChrome ? "py-1.5" : "py-3"
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Letter badge — during the morph window it shares layoutId with the
              reveal badge so the round-start reveal morphs its big centered
              badge down into this header slot instead of cutting. Once the
              morph settles it drops to a plain div (no projection node), so a
              keyboard-driven viewport resize can never re-project it. */}
          {morphActive ? (
            <motion.div
              layoutId={CB_LETTER_BADGE_LAYOUT_ID}
              transition={{ layout: LAYOUT_MORPH_TRANSITION }}
              data-category-blitz-letter-badge
              className={letterBadgeClassName}
            >
              {letterBadgeGlyph}
            </motion.div>
          ) : (
            <div data-category-blitz-letter-badge className={letterBadgeClassName}>
              {letterBadgeGlyph}
            </div>
          )}
          {/* The mode rule is a two-line reminder that has already done its job
              by the time someone is typing an answer — it is the single
              largest reclaimable block in this bar, so it yields to the answer
              list while the keyboard is open (`compactChrome`). The empty
              flex-1 spacer keeps the timer pinned right either way. */}
          {compactChrome ? (
            <div className="min-w-0 flex-1" />
          ) : (
            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={CHROME_ENTRANCE_TRANSITION}
            >
              <p className={`${theme.textLabel} leading-relaxed`}>
                {(() => {
                  const parts = MODE_CONFIG[mode].rule.split(" — ");
                  return parts.length > 1 ? <>{parts[0]}<br />— {parts[1]}</> : MODE_CONFIG[mode].rule;
                })()}
              </p>
            </motion.div>
          )}
          {/* Timer */}
          <motion.div
            className="shrink-0 text-right"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={CHROME_ENTRANCE_TRANSITION}
          >
            <TimerUrgency timeRemaining={timeRemaining} label={formatMmSs(timeRemaining)} />
            <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-500">remaining</p>
          </motion.div>
        </div>
        {/* Progress bar */}
        <motion.div
          className={`h-1 w-full overflow-hidden rounded-full bg-slate-800 ${compactChrome ? "mt-1" : "mt-2"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CHROME_ENTRANCE_TRANSITION}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isUrgent ? "bg-rose-500" : theme.progressFill
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (timeRemaining / 180) * 100))}%` }}
          />
        </motion.div>
      </div>

      {/* Categories grid */}
      <div
        ref={answerListRef}
        data-category-blitz-answer-list
        className="min-h-0 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-3 pt-3 [scroll-padding-bottom:1rem] [scroll-padding-top:0.75rem]"
      >
        <div className="space-y-2">
          {categories.map((category, i) => {
            const isActive = activeAnswerIndex === i && submitState === "idle" && !isExpired;
            // AnswerRow is memoized (Phase 6): a timer tick that only changes
            // `timeRemaining`/`nowMs` re-renders this list's parent, but not
            // the eleven rows whose `answer`/`isActive`/`disabled` didn't change.
            const rowBody = (
              <AnswerRow
                index={i}
                category={category}
                letter={letter}
                answer={answers[i]}
                isActive={isActive}
                disabled={isExpired || submitState !== "idle"}
                theme={theme}
                activeRingClass={activeRingClass}
                isLast={i === categories.length - 1}
                onActivate={handleRowFocus}
                onDeactivate={handleRowBlur}
                onChange={updateAnswer}
                onSubmitRow={handleRowSubmit}
              />
            );
            // Projected only while the reveal morph is running; a plain div for
            // the rest of the round so the keyboard's viewport resize has no
            // projection nodes to re-measure. See `morphActive` above.
            return morphActive ? (
              <motion.div
                key={i}
                layoutId={cbCategoryRowLayoutId(i)}
                transition={{ layout: LAYOUT_MORPH_TRANSITION }}
                data-category-blitz-answer-row-wrap={i}
                // Present ONLY while this row carries a live layout-projection
                // node, so a test (or the ?cbzDebug=1 panel) can assert the
                // board is unprojected for the rest of the round.
                data-category-blitz-row-projected=""
              >
                {rowBody}
              </motion.div>
            ) : (
              <div key={i} data-category-blitz-answer-row-wrap={i}>
                {rowBody}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer. This used to be the pinned editor — a second copy of the
          active row's category and answer, sitting above the keyboard. The
          rows now own real inputs (see AnswerRow), so the duplicate is gone
          and nothing is left here but submit-error recovery and the autosave
          reassurance line. It renders NOTHING while a row is being typed into,
          handing its full height to the answer list. */}
      {submitState === "error" ? (
        <div
          data-category-blitz-footer
          className="shrink-0 border-t border-rose-400/20 bg-slate-950 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
        >
          <p className="mb-2 text-center text-xs font-semibold text-rose-400">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              submittedRef.current = false;
              setSubmitState("idle");
              void submitAnswers();
            }}
            className="w-full rounded-xl border border-rose-400/50 bg-rose-500/20 py-3 text-sm font-black text-rose-300"
          >
            Retry
          </button>
        </div>
      ) : submitState === "idle" && !isExpired && !compactChrome ? (
        <div
          data-category-blitz-footer
          className={`shrink-0 border-t ${theme.borderSoft} bg-slate-950 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3`}
        >
          <p className={`text-center text-xs font-semibold uppercase tracking-[0.1em] ${theme.textAccentSoft}`}>
            Answers save automatically — graded when the timer runs out
          </p>
        </div>
      ) : null}
    </div>
  );
});
AnsweringScreen.displayName = "AnsweringScreen";

// ── Header ────────────────────────────────────────────────────────────────────

function Header({
  phase,
  error,
  onBack,
  isContinuous,
  compact = false,
}: {
  phase?: CategoryBlitzPhase;
  error?: string | null;
  onBack?: () => void;
  /** True when the venue is running continuous (endless) mode — shows an "∞ Continuous" badge. */
  isContinuous?: boolean;
  /** True while a player is typing into an answer row. The iOS keyboard leaves
   *  roughly half the screen, and this bar costs ~57px of it for an affordance
   *  nobody reaches for mid-answer — so it yields its space to the answer list
   *  and comes back the moment the keyboard closes. See `compactChrome` in
   *  AnsweringScreen (docs/category-blitz-app-feel-plan.md, Phase 8). */
  compact?: boolean;
}) {
  if (compact) return null;
  return (
    <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950 px-4 py-3`}>
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to venue"
            className="tp-clean-button -ml-1 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 pl-1 pr-2.5 text-emerald-300 transition-colors hover:bg-emerald-500/20 hover:text-emerald-200"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            <span className="text-[0.65rem] font-black uppercase tracking-[0.1em]">Back</span>
          </button>
        ) : null}
        {error && (
          <span className="ml-auto text-[0.6rem] font-black uppercase tracking-widest text-rose-400">
            Reconnecting…
          </span>
        )}
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function CategoryBlitzGame({ onBack }: { onBack?: () => void } = {}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [venueId, setVenueId] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [testMode, setTestMode] = useState(false);
  // Set by AnsweringScreen while a row is being typed into. The only thing the
  // root owns that competes with the answer list for keyboard-open space is the
  // Back bar, so this hides exactly that. `setAnswerEditing` is passed straight
  // through as the callback: a `useState` setter is referentially stable, which
  // keeps AnsweringScreen's `memo` from re-rendering on every root tick.
  const [answerEditing, setAnswerEditing] = useState(false);

  useCategoryBlitzVisibleViewportFrame();

  useEffect(() => {
    document.documentElement.classList.add("tp-category-blitz-game-active");
    document.body.classList.add("tp-category-blitz-game-active");
    return () => {
      document.documentElement.classList.remove("tp-category-blitz-game-active");
      document.body.classList.remove("tp-category-blitz-game-active");
    };
  }, []);

  useEffect(() => {
    const hydrateId = window.setTimeout(() => {
      setVenueId(getVenueId() ?? "");
      setUsername(getUsername() ?? null);
      setUserId(getUserId() ?? "");
      setTestMode(isCategoryBlitzTestModeEnabled());
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrateId);
  }, []);

  const { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, error, errorEscalated, retry, markRevealDone, markResultsRevealDone, dismissComplete } = useCategoryBlitzSession(
    isHydrated ? venueId : "",
    isHydrated ? userId : ""
  );
  const { triggerAnimation } = useAnimationTrigger();
  const isContinuous = session?.sessionType === "continuous";

  // Turning the toggle on force-converts the live auto session to test mode —
  // see the effect below (keyed on session.id), which handles both this and
  // the already-on-at-load case.
  const toggleTestMode = useCallback(() => {
    setTestMode((prev) => {
      const next = !prev;
      setCategoryBlitzTestMode(next);
      return next;
    });
  }, []);

  // Dev-only: force the current wait (answer timer, intermission, or lobby
  // dwell) to elapse immediately instead of watching real-time countdowns.
  // Visibility here is purely a UX convenience — the actual safety boundary
  // is server-side (skipRound rejects anything but a session whose own
  // test_mode DB column is true), so gating on session.testMode (server
  // truth) rather than just the local toggle avoids showing a button that
  // would just 403 against a real session.
  const [isSkippingRound, setIsSkippingRound] = useState(false);

  // If test mode is already on (persisted from a prior visit) when a
  // non-test auto session comes into view, force-convert it once so the
  // Skip-round button appears without the tester having to re-toggle. Keyed on
  // session.id so it fires at most once per session; the flipped column
  // arrives on the next poll.
  const convertedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!testMode || !session?.id || session.source !== "auto" || session.testMode) return;
    if (!["lobby", "active"].includes(session.status)) return;
    if (convertedSessionRef.current === session.id) return;
    convertedSessionRef.current = session.id;
    void fetch(`/api/category-blitz/sessions/${session.id}/enable-test-mode`, { method: "POST" }).catch(() => {
      // Best-effort dev tooling — poll keeps showing current state on failure.
    });
  }, [testMode, session?.id, session?.source, session?.testMode, session?.status]);

  const canSkipRound = testMode && !!session?.testMode && (session?.status === "lobby" || session?.status === "active");
  const skipRound = useCallback(() => {
    if (!session?.id || isSkippingRound) return;
    setIsSkippingRound(true);
    void fetch(`/api/category-blitz/sessions/${session.id}/skip-round`, { method: "POST" })
      .then((res) => {
        // Don't wait for the 15s fallback poll (or a realtime push that may
        // lag) to reflect the skip — the endpoint has already advanced the
        // server state by the time it responds, so reload immediately for a
        // snappy, near-instant transition. Only on success; a failed skip left
        // the state unchanged, so a reload would just re-show the same thing.
        if (res.ok) retry();
      })
      .catch(() => {
        // Best-effort — the realtime subscription/poll will simply keep
        // showing the current state if this fails, same as any other
        // dropped dev-tooling request.
      })
      .finally(() => setIsSkippingRound(false));
  }, [session, isSkippingRound, retry]);

  // The round in play right now drives the whole page's ambient color world
  // (§4c) — "Blend In!" for the round's full duration (answering → scoring →
  // reveal → results), falling back to "standard" once nothing round-scoped
  // is active (lobby/idle/complete keep the default look). `results` (the
  // just-scored round) takes over from `round` once the round itself is
  // superseded by the next one's realtime payload but its results are still
  // on screen.
  const isRoundScopedPhase = phase === "answering" || phase === "scoring" || phase === "reveal" || phase === "results";
  const activeMode: CategoryBlitzMode =
    (isRoundScopedPhase ? round?.mode ?? results?.mode : undefined) ?? "standard";
  const pageTheme = GAME_THEME[MODE_CONFIG[activeMode].themeKey];

  // An admin ending a session (or one ending with no completed round) lands
  // here with no standings to show — CompleteScreen's bare "session has
  // ended" fallback (no podium, no next-game info). Without this, that
  // screen would sit for up to RECENTLY_COMPLETED_GRACE_MS (3 minutes, see
  // lib/categoryBlitz.ts) before the server stops re-delivering the
  // completed session and the client falls back to idle. Fast-path it to 3
  // seconds instead. Only applies to the empty fallback — a session that
  // completed with real standings keeps them on screen (see Phase 3/4:
  // points count-up + next-game messaging) until the player navigates away
  // or the grace window naturally lapses.
  const hasCompleteStandings = phase === "complete" && !!results && results.totals.length > 0;
  useEffect(() => {
    if (phase !== "complete" || hasCompleteStandings) return;
    const t = window.setTimeout(() => { dismissComplete(); }, 3000);
    return () => window.clearTimeout(t);
  }, [phase, hasCompleteStandings, dismissComplete]);

  // Venue point total count-up (CompleteScreen's "Your Total Points" card):
  // snapshot the viewer's venue-wide leaderboard total (users.points, the
  // same number /api/leaderboard and TriviaGame's own count-up read) once
  // when a new session first appears, before any of its rounds have scored,
  // then again once the session completes and its points have been awarded
  // (lib/categoryBlitz.ts awardCategoryBlitzPoints writes into that same
  // column). Both snapshots are keyed by session.id so a second session in
  // the same page lifetime gets its own before/after pair.
  const fetchVenuePoints = useCallback(async (): Promise<number | null> => {
    if (!venueId || !userId) return null;
    try {
      const res = await fetch(`/api/leaderboard?venue=${encodeURIComponent(venueId)}&userId=${encodeURIComponent(userId)}`);
      const json = (await res.json()) as { ok: boolean; entries?: { userId: string; points: number }[] };
      if (!json.ok) return null;
      const entry = (json.entries ?? []).find((e) => e.userId === userId);
      return entry ? entry.points : null;
    } catch {
      return null;
    }
  }, [venueId, userId]);

  const [venuePointsBefore, setVenuePointsBefore] = useState<{ sessionId: string; points: number } | null>(null);
  const [venuePointsAfter, setVenuePointsAfter] = useState<{ sessionId: string; points: number } | null>(null);

  useEffect(() => {
    if (!session?.id || phase === "complete" || venuePointsBefore?.sessionId === session.id) return;
    let cancelled = false;
    void fetchVenuePoints().then((points) => {
      if (cancelled || points === null) return;
      setVenuePointsBefore({ sessionId: session.id, points });
    });
    return () => { cancelled = true; };
  }, [session?.id, phase, venuePointsBefore, fetchVenuePoints]);

  useEffect(() => {
    if (phase !== "complete" || !session?.id || venuePointsAfter?.sessionId === session.id) return;
    let cancelled = false;
    void fetchVenuePoints().then((points) => {
      if (cancelled || points === null) return;
      setVenuePointsAfter({ sessionId: session.id, points });
    });
    return () => { cancelled = true; };
  }, [phase, session?.id, venuePointsAfter, fetchVenuePoints]);

  // Next-game messaging on the game-over screen (CompleteScreen's
  // NextGameStatus): once a session completes, fetch the venue's next
  // scheduled window the same way the idle lobby does, so the player learns
  // when to come back (or that nothing else is scheduled) without first
  // having to fall back to the lobby screen themselves.
  const [completeNextWindow, setCompleteNextWindow] = useState<{ sessionId: string; nextWindowAtMs: number | null } | null>(null);

  useEffect(() => {
    if (phase !== "complete" || !session?.id || completeNextWindow?.sessionId === session.id) return;
    let cancelled = false;
    void fetchCategoryBlitzNextWindowAt(venueId).then((ms) => {
      if (cancelled) return;
      setCompleteNextWindow({ sessionId: session.id, nextWindowAtMs: ms });
    });
    return () => { cancelled = true; };
  }, [phase, session?.id, completeNextWindow, venueId]);

  // Phase 5 stats bar: snapshot the viewer's rank the first time this session
  // produces results with them in it, so the game-over screen can show how far
  // they climbed/fell (rankGained = firstRank - finalRank, positive = climbed).
  // Keyed on session.id (not a plain boolean) so it resets cleanly if another
  // session starts in the same page lifetime. State (not a ref) because the
  // value feeds the render below — refs can't be read during render.
  const [firstRank, setFirstRank] = useState<{ sessionId: string; rank: number } | null>(null);
  if (results && userId && session?.id && firstRank?.sessionId !== session.id) {
    const standings = results.totals.slice().sort((a, b) => b.points - a.points);
    const rank = standings.findIndex((t) => t.userId === userId);
    if (rank !== -1) setFirstRank({ sessionId: session.id, rank: rank + 1 });
  }
  const rankGained = useMemo(() => {
    if (!results || !userId || !firstRank || firstRank.sessionId !== session?.id) return null;
    const standings = results.totals.slice().sort((a, b) => b.points - a.points);
    const finalRank = standings.findIndex((t) => t.userId === userId);
    if (finalRank === -1) return null;
    return firstRank.rank - (finalRank + 1);
  }, [results, userId, session?.id, firstRank]);

  // Round start reveal: play the letter drop + category cascade once per round
  // when we enter the answering phase, then transition to the answer input.
  //
  // A page reload remounts this component from scratch: `finishedRevealRoundId`
  // resets to null, but `round.startedAt` is server-anchored. If the round has
  // already been running long enough that a continuous tab would have finished
  // the reveal, skip it and show the board immediately.
  const [finishedRevealRoundId, setFinishedRevealRoundId] = useState<string | null>(null);
  const fallbackMarkedRevealRoundIdRef = useRef<string | null>(null);
  // Render bodies can't call Date.now() directly (impure) — mirror it into
  // state via its own tick instead, same pattern as IdleScreen's countdown.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const answeringRoundId = round?.id ?? null;
  const answeringRoundStartedAt = round?.startedAt ?? null;
  const revealElapsedMs = answeringRoundStartedAt ? nowMs - new Date(answeringRoundStartedAt).getTime() : 0;
  const showReveal =
    phase === "answering" &&
    !!round &&
    round.id !== finishedRevealRoundId &&
    revealElapsedMs <= ROUND_START_REVEAL_MAX_MS;

  // AnsweringScreen only has shared-layoutId partners to FLIP from when it is
  // replacing a reveal that just finished on screen, which is exactly
  // `finishedRevealRoundId === round.id` (set by RoundStartReveal's onDone).
  // Every other way of reaching the board — a mid-round reload, or the
  // elapsed-time cutoff below — never had a reveal to morph from, so the board
  // mounts with no layout projection at all. See AnsweringScreen's
  // `morphActive`.
  const morphFromReveal = !!round && finishedRevealRoundId === round.id;

  // The case above (elapsed time already past the reveal's max duration)
  // never mounts RoundStartReveal, so its onDone/markRevealDone callback
  // never fires on its own — without this, the auto-scoring timer gate
  // (revealDoneRef, lib/categoryBlitzRealtime.ts) would stay blocked for
  // the rest of the round. Mirrors the visibility-resync forceReveal path
  // in the hook. The ref is a one-shot guard so this fallback marks each round
  // once without using state from inside the effect.
  useEffect(() => {
    if (
      phase === "answering" &&
      answeringRoundId &&
      answeringRoundId !== finishedRevealRoundId &&
      answeringRoundStartedAt &&
      revealElapsedMs > ROUND_START_REVEAL_MAX_MS &&
      fallbackMarkedRevealRoundIdRef.current !== answeringRoundId
    ) {
      fallbackMarkedRevealRoundIdRef.current = answeringRoundId;
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[CategoryBlitzGame] round ${answeringRoundId}: reveal never mounted, marking done via elapsed-time fallback`);
      }
      markRevealDone(answeringRoundId);
    }
  }, [phase, answeringRoundId, answeringRoundStartedAt, finishedRevealRoundId, revealElapsedMs, markRevealDone]);

  // The viewer's OWN answers, one row per category they answered — the
  // emotionally relevant set to watch get graded. Memoized so the ~4x/sec
  // timer re-renders don't hand GradingCascade a fresh array and stall its
  // internal reveal timers.
  const gradingAnswers: GradingAnswer[] = useMemo(() => {
    if (!results || !userId) return [];
    return results.results.flatMap((cat) => {
      const mine = cat.answers.find((a) => a.userId === userId);
      if (!mine) return [];
      return [{
        category: cat.category,
        answer: mine.answer,
        reason: mine.reason,
        explanation: mine.explanation,
        points: mine.pointsAwarded,
        mode: results.mode,
      }];
    });
  }, [results, userId]);

  // The grading cascade now runs inside the server-anchored "reveal" phase
  // (see useCategoryBlitzSession Phase 3) instead of a client-derived boolean.
  // We render the cascade once the viewer's graded answers have populated; if
  // "reveal" is entered before `results` land, we hold a loading beat rather
  // than skipping. `markResultsRevealDone` advances the phase to "results".
  const revealReady = phase === "reveal" && !!results && !!userId;
  const showCascade = revealReady && gradingAnswers.length > 0;

  // Players who submitted nothing have no cascade to play — as soon as their
  // (empty) graded answers resolve, advance straight to results so we don't
  // hold the loading beat forever.
  useEffect(() => {
    if (revealReady && gradingAnswers.length === 0 && results) {
      markResultsRevealDone(results.roundId);
    }
  }, [revealReady, gradingAnswers.length, results, markResultsRevealDone]);

  // Phase 4: the reveal journey (RevealSequence — full-screen cascade → guided
  // scroll → leaderboard) reports back here once it has settled, flipping the
  // hook from "reveal" to the resting "results" intermission. Kept stable
  // (markResultsRevealDone is itself stable) so RevealSequence's own beat
  // timers don't churn on the ~4x/sec results-phase re-renders.
  const handleRevealSettled = useCallback(
    (roundId: string) => { markResultsRevealDone(roundId); },
    [markResultsRevealDone]
  );

  // Leaderboard exit beat: rows accelerate up/out as intermission runs out,
  // just before the round flips over.
  const leaderboardExiting =
    phase === "results" &&
    !!results &&
    nextRoundStartsIn !== null &&
    nextRoundStartsIn <= 1;

  // True once the session is complete and the viewer placed first.
  const isChampion = useMemo(() => {
    if (!results || results.totals.length === 0) return false;
    const sorted = results.totals.slice().sort((a, b) => b.points - a.points);
    return sorted[0]?.userId === userId;
  }, [results, userId]);

  // The winner gets the same full-screen champion celebration Live Trivia
  // uses (fireworks + trophy + "CATEGORY BLITZ WINNER!") instead of the
  // smaller inline SessionCompleteFireworks overlay below — fired once per
  // session via the global animation trigger (see AnimationTriggerProvider,
  // mounted in app/layout.tsx).
  const championFiredSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "complete" || !session || !isChampion) return;
    if (championFiredSessionRef.current === session.id) return;
    championFiredSessionRef.current = session.id;
    triggerAnimation("CATEGORY_BLITZ_CHAMPION");
  }, [phase, session, isChampion, triggerAnimation]);

  // "Blend In!" mode-flip takeover (docs/category-blitz-mode-b-plan.md §4b):
  // fires exactly once per round, the moment a freshly-started reverse round
  // is detected (the same `showReveal` window RoundStartReveal uses) — never
  // for the reverse → standard reversion, which relies on the ModeSign flip +
  // ambient board theme shift alone. Keyed on round.id so a reload mid-round
  // (showReveal already false by then) never replays it.
  const modeFlipFiredRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showReveal || !round || round.mode !== "reverse") return;
    if (modeFlipFiredRoundRef.current === round.id) return;
    modeFlipFiredRoundRef.current = round.id;
    triggerAnimation("CATEGORY_BLITZ_MODE_FLIP", { modeFlipVariant: getModeFlipTakeoverVariant() });
  }, [showReveal, round, triggerAnimation]);

  // Game-over celebration: SessionCompleteFireworks holds itself on screen
  // briefly (see its own onDone timer) then reports back so it can be
  // unmounted, revealing the persistent podium/stats CompleteScreen beneath
  // it. Keyed on session.id so a later session's game-over plays again.
  // Skipped entirely for the champion, who gets the full-screen animation
  // above instead — CompleteScreen renders underneath either way.
  const [fireworksDoneSessionId, setFireworksDoneSessionId] = useState<string | null>(null);
  const fireworksDone = fireworksDoneSessionId === session?.id;

  if (!isHydrated) {
    return (
      <CategoryBlitzFrame className="flex flex-col bg-slate-950 text-white">
        <Header onBack={onBack} />
        <CategoryBlitzLayoutDebugPanel phase={phase} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
          <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
            <p className={TEXT_LABEL}>Loading game status</p>
            <p className="mt-3 text-sm text-slate-400">Checking your venue session and current schedule…</p>
          </div>
        </div>
      </CategoryBlitzFrame>
    );
  }

  if (!venueId) {
    return (
      <CategoryBlitzFrame className="flex flex-col bg-slate-950 text-white">
        <Header onBack={onBack} />
        <CategoryBlitzLayoutDebugPanel phase={phase} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
          <p className="text-sm text-slate-400">No venue session. Return to your venue page.</p>
        </div>
      </CategoryBlitzFrame>
    );
  }

  // Only take over the whole screen with a connection error when there's no
  // usable phase content yet (we've never successfully loaded a session), OR
  // once the failure has persisted long enough to call it a real outage
  // (errorEscalated) rather than a passing network blip — otherwise a single
  // dropped poll would wipe answers and scoring reasons off the screen during
  // intermission for no reason.
  if (error && (phase === "idle" || errorEscalated)) {
    return (
      <CategoryBlitzFrame className="flex flex-col bg-slate-950 text-white">
        <Header phase={phase} error={error} onBack={onBack} isContinuous={isContinuous} />
        <CategoryBlitzLayoutDebugPanel phase={phase} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/40 bg-slate-900 p-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-300">Connection error</p>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
            {errorEscalated && (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  This has been failing for a while — your game state may be stale.
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 w-full rounded-xl border border-rose-400/50 bg-rose-500/20 py-2.5 text-sm font-black uppercase tracking-wider text-rose-300"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      </CategoryBlitzFrame>
    );
  }

  return (
    <CategoryBlitzFrame
      className={`flex flex-col text-white transition-colors duration-700 ${pageTheme.pageBg}`}
    >
      <Header phase={phase} error={error} onBack={onBack} isContinuous={isContinuous} compact={answerEditing} />
      <CategoryBlitzLayoutDebugPanel phase={phase} />
      {/* Dev-only test-mode UI: hidden on the live site (NODE_ENV === "production")
          so real players never see it, but still fully functional when running
          `npm run dev`. The testMode flag/localStorage plumbing itself is untouched
          so this can be brought back for a given surface by relaxing this guard. */}
      {process.env.NODE_ENV !== "production" && (
        <>
          <button
            type="button"
            data-category-blitz-dev-only
            onClick={toggleTestMode}
            className={`fixed bottom-2 right-2 z-[999] rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
              testMode ? "bg-amber-400 text-slate-950" : "bg-slate-800/80 text-slate-400"
            }`}
          >
            Test mode: {testMode ? "on" : "off"}
          </button>
          {canSkipRound && (
            <button
              type="button"
              data-category-blitz-dev-only
              onClick={skipRound}
              disabled={isSkippingRound}
              className="fixed bottom-2 right-32 z-[999] rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-950 disabled:opacity-50"
            >
              {isSkippingRound ? "Skipping…" : "Skip round"}
            </button>
          )}
          {testMode && <DevAnimationPanel />}
        </>
      )}

      {/* Phase content. Continuous sessions never show the scheduled engine's
          LobbyScreen — the game is always running, so the only pre-round beat
          is a brief intermission-style countdown (ContinuousWaitScreen). The
          "idle" phase (no session at all) keeps LobbyScreen: scheduled venues
          genuinely idle there, and for continuous venues it's a sub-second
          transient while the first poll self-heals the session. */}
      {(phase === "idle" || phase === "lobby") &&
        (isContinuous ? (
          <ContinuousWaitScreen lobbyCountdown={lobbyCountdown} playerCount={session?.playerCount} />
        ) : (
          <LobbyScreen
            phase={phase}
            venueId={venueId}
            username={username}
            lobbyCountdown={lobbyCountdown}
            playerCount={session?.playerCount}
            testMode={testMode}
          />
        ))}
      {phase === "answering" && round && (
        showReveal ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain">
            <RoundStartReveal
              letter={round.letter}
              categories={round.categories}
              onDone={() => {
                fallbackMarkedRevealRoundIdRef.current = round.id;
                setFinishedRevealRoundId(round.id);
                markRevealDone(round.id);
              }}
            />
          </div>
        ) : (
          <AnsweringScreen
            letter={round.letter}
            categories={round.categories}
            roundId={round.id}
            timeRemaining={timeRemaining}
            venueId={venueId}
            userId={userId}
            playerCount={session?.playerCount}
            mode={round.mode}
            morphFromReveal={morphFromReveal}
            onEditingChange={setAnswerEditing}
          />
        )
      )}
      {phase === "scoring" && <ScoringScreen mode={activeMode} />}
      {/* Reveal phase: play the full-screen reveal journey (cascade → guided
          scroll → leaderboard), or hold a loading beat while the viewer's
          graded answers are still in flight (never skip it). */}
      {phase === "reveal" && (
        showCascade && results ? (
          <RevealSequence
            answers={gradingAnswers}
            leaderboardEntries={results.totals}
            meId={userId}
            roundId={results.roundId}
            onSettled={handleRevealSettled}
            nextRoundStartsIn={nextRoundStartsIn}
          />
        ) : (
          <ScoringScreen mode={activeMode} />
        )
      )}
      {phase === "results" && results && userId && (
        <ResultsScreen
          results={results}
          userId={userId}
          nextRoundStartsIn={nextRoundStartsIn}
          playerCount={session?.playerCount}
          leaderboardExiting={leaderboardExiting}
        />
      )}
      {phase === "complete" && (
        <>
          <AnimatePresence>
            {!fireworksDone && !isChampion && results && results.totals.length > 0 && (
              <SessionCompleteFireworks
                finalStandings={results.totals}
                onDone={() => setFireworksDoneSessionId(session?.id ?? null)}
              />
            )}
          </AnimatePresence>
          <CompleteScreen
            results={results}
            userId={userId}
            venueId={venueId}
            username={username}
            rankGained={rankGained}
            venuePointsBefore={session?.id && venuePointsBefore?.sessionId === session.id ? venuePointsBefore.points : null}
            venuePointsAfter={session?.id && venuePointsAfter?.sessionId === session.id ? venuePointsAfter.points : null}
            nextWindowInfo={
              session?.id && completeNextWindow?.sessionId === session.id
                ? { nextWindowAtMs: completeNextWindow.nextWindowAtMs }
                : null
            }
            isContinuous={isContinuous}
          />
        </>
      )}
    </CategoryBlitzFrame>
  );
}
