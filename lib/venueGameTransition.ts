"use client";

import type { VenueGameKey } from "@/lib/venueGameCards";

type VenueEntrySnapshot = {
  gameKey: VenueGameKey;
  startedAt: number;
};

type VenueCardViewportSnapshot = {
  gameKey: VenueGameKey;
  leftRatio: number;
  topRatio: number;
  widthRatio: number;
  heightRatio: number;
  borderRadiusPx: number;
  capturedAt: number;
};

type OpenTransitionArgs = {
  gameKey: VenueGameKey;
  sourceElement: HTMLElement | null;
  targetPath: string;
  navigate: () => void | Promise<void>;
};

type ReturnTransitionArgs = {
  gameKey: VenueGameKey;
  navigate: () => void | Promise<void>;
};

const VENUE_ENTRY_STORAGE_KEY = "tp:venue:entry-snapshot:v1";
const VENUE_TRANSITION_GATE_STORAGE_KEY = "tp:venue:transition-gate-until:v1";
const VENUE_CARD_VIEWPORT_STORAGE_KEY = "tp:venue:card-viewport:v1";

const OPEN_FLIP_DURATION_MS = 520;
const RETURN_FLIP_DURATION_MS = 560;
const OPEN_FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const RETURN_FLIP_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const SETTLE_DURATION_MS = 210;
const SETTLE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_GATE_DURATION_MS = 950;
const RETURN_GATE_DURATION_MS = 2600;

const FALLBACK_CARD_BG_BY_KEY: Record<VenueGameKey, string> = {
  trivia: "linear-gradient(132deg,#0ea5e9 0%,#2563eb 42%,#7c3aed 100%)",
  bingo: "linear-gradient(128deg,#f97316 0%,#ef4444 48%,#ec4899 100%)",
  pickem: "linear-gradient(134deg,#2563eb 0%,#7c3aed 56%,#ec4899 100%)",
  fantasy: "linear-gradient(134deg,#7c3aed 0%,#2563eb 48%,#06b6d4 100%)",
  predictions: "linear-gradient(134deg,#0f172a 0%,#334155 48%,#1e293b 100%)",
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setVenueTransitionGate(durationMs: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const until = Date.now() + Math.max(0, Math.round(durationMs));
    window.sessionStorage.setItem(VENUE_TRANSITION_GATE_STORAGE_KEY, String(until));
  } catch {
    // Ignore storage failures on privacy-restricted browsers.
  }
}

export function isVenueTransitionGateActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.sessionStorage.getItem(VENUE_TRANSITION_GATE_STORAGE_KEY);
    const until = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(until) || until <= 0) {
      return false;
    }
    return Date.now() < until;
  } catch {
    return false;
  }
}

function parseRadiusValue(input: string): number | null {
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function resolveElementRadiusPx(element: HTMLElement, fallback = 22): number {
  const computed = window.getComputedStyle(element);
  const value = parseRadiusValue(computed.borderTopLeftRadius);
  return value ?? fallback;
}

function isPathMatch(currentPath: string, targetPath: string): boolean {
  if (!targetPath) {
    return false;
  }
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function waitForPath(targetPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const currentPath = window.location.pathname;
      if (isPathMatch(currentPath, targetPath)) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 16);
  });
}

function waitForVenueCard(gameKey: VenueGameKey, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const card = document.querySelector<HTMLElement>(`[data-venue-game-card="${gameKey}"]`);
      if (card) {
        window.clearInterval(timer);
        resolve(card);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 16);
  });
}

function saveEntrySnapshot(gameKey: VenueGameKey): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload: VenueEntrySnapshot = {
      gameKey,
      startedAt: Date.now(),
    };
    window.sessionStorage.setItem(VENUE_ENTRY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures on privacy-restricted browsers.
  }
}

export function hasFreshVenueEntrySnapshot(gameKey: VenueGameKey, maxAgeMs = 8 * 60 * 1000): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.sessionStorage.getItem(VENUE_ENTRY_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as Partial<VenueEntrySnapshot>;
    if (parsed.gameKey !== gameKey) {
      return false;
    }
    const startedAt = Number(parsed.startedAt ?? 0);
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      return false;
    }
    return Date.now() - startedAt <= maxAgeMs;
  } catch {
    return false;
  }
}

function saveCardViewportSnapshot(gameKey: VenueGameKey, element: HTMLElement): void {
  if (typeof window === "undefined") {
    return;
  }
  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const borderRadiusPx = resolveElementRadiusPx(element, 22);

  const payload: VenueCardViewportSnapshot = {
    gameKey,
    leftRatio: clamp(rect.left / viewportWidth, 0, 1),
    topRatio: clamp(rect.top / viewportHeight, 0, 1),
    widthRatio: clamp(rect.width / viewportWidth, 0.06, 1),
    heightRatio: clamp(rect.height / viewportHeight, 0.08, 1),
    borderRadiusPx: clamp(borderRadiusPx, 8, 56),
    capturedAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(VENUE_CARD_VIEWPORT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures on privacy-restricted browsers.
  }
}

function readCardViewportSnapshot(gameKey: VenueGameKey): VenueCardViewportSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(VENUE_CARD_VIEWPORT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<VenueCardViewportSnapshot>;
    if (parsed.gameKey !== gameKey) {
      return null;
    }

    const leftRatio = Number(parsed.leftRatio);
    const topRatio = Number(parsed.topRatio);
    const widthRatio = Number(parsed.widthRatio);
    const heightRatio = Number(parsed.heightRatio);
    const borderRadiusPx = Number(parsed.borderRadiusPx);
    const capturedAt = Number(parsed.capturedAt ?? 0);

    if (
      !Number.isFinite(leftRatio) ||
      !Number.isFinite(topRatio) ||
      !Number.isFinite(widthRatio) ||
      !Number.isFinite(heightRatio) ||
      !Number.isFinite(borderRadiusPx)
    ) {
      return null;
    }

    return {
      gameKey,
      leftRatio: clamp(leftRatio, 0, 1),
      topRatio: clamp(topRatio, 0, 1),
      widthRatio: clamp(widthRatio, 0.06, 1),
      heightRatio: clamp(heightRatio, 0.08, 1),
      borderRadiusPx: clamp(borderRadiusPx, 8, 56),
      capturedAt: Number.isFinite(capturedAt) ? capturedAt : 0,
    };
  } catch {
    return null;
  }
}

function createSharedElementOverlay(gameKey: VenueGameKey, sourceElement: HTMLElement): {
  root: HTMLDivElement;
  backdrop: HTMLDivElement;
  shell: HTMLDivElement;
} {
  const root = document.createElement("div");
  root.setAttribute("data-venue-transition", gameKey);
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2100";
  root.style.pointerEvents = "none";

  const backdrop = document.createElement("div");
  backdrop.style.position = "absolute";
  backdrop.style.inset = "0";
  backdrop.style.opacity = "0";
  backdrop.style.background = "rgba(2, 6, 23, 0.42)";
  backdrop.style.willChange = "opacity";

  const shell = document.createElement("div");
  shell.style.position = "absolute";
  shell.style.left = "0";
  shell.style.top = "0";
  shell.style.width = `${Math.max(1, window.innerWidth)}px`;
  shell.style.height = `${Math.max(1, window.innerHeight)}px`;
  shell.style.overflow = "hidden";
  shell.style.transformOrigin = "top left";
  shell.style.background = FALLBACK_CARD_BG_BY_KEY[gameKey];
  shell.style.boxShadow = "0 22px 66px rgba(2, 6, 23, 0.42)";
  shell.style.willChange = "transform, border-radius, opacity";

  const clone = sourceElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[id]").forEach((node) => {
    node.removeAttribute("id");
  });
  clone.style.position = "absolute";
  clone.style.inset = "0";
  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.margin = "0";
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  clone.style.transform = "none";
  clone.style.pointerEvents = "none";
  clone.style.overflow = "hidden";
  clone.style.boxSizing = "border-box";

  shell.appendChild(clone);
  root.appendChild(backdrop);
  root.appendChild(shell);

  return { root, backdrop, shell };
}

async function playWAAPI(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Promise<void> {
  if (typeof element.animate === "function") {
    const animation = element.animate(keyframes, options);
    try {
      await animation.finished;
    } catch {
      // Ignore interruption errors from route unmounts.
    }
    return;
  }

  const lastFrame = keyframes[keyframes.length - 1];
  if (lastFrame) {
    for (const [key, value] of Object.entries(lastFrame)) {
      if (key === "offset") {
        continue;
      }
      if (typeof value === "string") {
        (element.style as any)[key] = value;
      }
    }
  }
  const duration = typeof options.duration === "number" ? options.duration : OPEN_FLIP_DURATION_MS;
  if (duration > 0) {
    await wait(duration);
  }
}

function getRectFromSnapshot(snapshot: VenueCardViewportSnapshot): DOMRect {
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const width = clamp(snapshot.widthRatio * viewportWidth, 120, viewportWidth);
  const height = clamp(snapshot.heightRatio * viewportHeight, 180, viewportHeight);
  const left = clamp(snapshot.leftRatio * viewportWidth, 0, Math.max(0, viewportWidth - width));
  const top = clamp(snapshot.topRatio * viewportHeight, 0, Math.max(0, viewportHeight - height));
  return new DOMRect(left, top, width, height);
}

async function animateVenueCardSettle(gameKey: VenueGameKey): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const card = await waitForVenueCard(gameKey, 1400);
  if (!card) {
    return;
  }

  const previousTransition = card.style.transition;
  const previousTransform = card.style.transform;
  const previousTransformOrigin = card.style.transformOrigin;
  const previousWillChange = card.style.willChange;
  const previousOpacity = card.style.opacity;

  card.style.transition = "none";
  card.style.transformOrigin = "50% 50%";
  card.style.willChange = "transform, opacity";
  card.style.transform = "translate3d(0, -2px, 0) scale(1.03)";
  card.style.opacity = "0.92";
  card.getBoundingClientRect();

  window.requestAnimationFrame(() => {
    card.style.transition = `transform ${SETTLE_DURATION_MS}ms ${SETTLE_EASING}, opacity ${SETTLE_DURATION_MS}ms ease`;
    card.style.transform = "translate3d(0, 0, 0) scale(1)";
    card.style.opacity = "1";
  });

  await wait(SETTLE_DURATION_MS + 26);
  card.style.transition = previousTransition;
  card.style.transform = previousTransform;
  card.style.transformOrigin = previousTransformOrigin;
  card.style.willChange = previousWillChange;
  card.style.opacity = previousOpacity;
}

export async function navigateBackToVenue({
  venuePath,
  fallbackNavigate,
  timeoutMs = 260,
}: {
  venuePath: string;
  fallbackNavigate: () => void | Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  if (typeof window === "undefined") {
    await Promise.resolve(fallbackNavigate());
    return;
  }

  const targetPath = venuePath.startsWith("/") ? venuePath : `/${venuePath}`;
  if (isPathMatch(window.location.pathname, targetPath)) {
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    const landedOnVenue = await waitForPath(targetPath, timeoutMs);
    if (landedOnVenue) {
      return;
    }
  }

  await Promise.resolve(fallbackNavigate());
}

export async function runVenueGameOpenTransition({
  gameKey,
  sourceElement,
  targetPath,
  navigate,
}: OpenTransitionArgs): Promise<void> {
  saveEntrySnapshot(gameKey);
  setVenueTransitionGate(OPEN_GATE_DURATION_MS);

  if (typeof window === "undefined" || typeof document === "undefined" || prefersReducedMotion()) {
    await Promise.resolve(navigate());
    return;
  }

  if (!sourceElement) {
    await Promise.resolve(navigate());
    return;
  }

  saveCardViewportSnapshot(gameKey, sourceElement);

  const firstRect = sourceElement.getBoundingClientRect();
  if (firstRect.width <= 0 || firstRect.height <= 0) {
    await Promise.resolve(navigate());
    return;
  }

  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const firstRadius = resolveElementRadiusPx(sourceElement, 22);
  const scaleX = clamp(firstRect.width / viewportWidth, 0.06, 1);
  const scaleY = clamp(firstRect.height / viewportHeight, 0.08, 1);
  const translateX = Math.round(firstRect.left);
  const translateY = Math.round(firstRect.top);
  const midTranslateX = Math.round(translateX * 0.12);
  const midTranslateY = Math.round(translateY * 0.12);
  const midScaleX = clamp(scaleX + (1 - scaleX) * 0.88, 0.06, 1);
  const midScaleY = clamp(scaleY + (1 - scaleY) * 0.88, 0.08, 1);
  const midRadius = Math.max(6, Math.round(firstRadius * 0.3));
  const startTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;
  const midTransform = `translate3d(${midTranslateX}px, ${midTranslateY}px, 0) scale(${midScaleX}, ${midScaleY})`;
  const endTransform = "translate3d(0px, 0px, 0) scale(1, 1)";

  const { root, backdrop, shell } = createSharedElementOverlay(gameKey, sourceElement);
  shell.style.transform = startTransform;
  shell.style.borderRadius = `${Math.round(firstRadius)}px`;
  document.body.appendChild(root);

  // Fade the cloned button content out quickly so only the gradient shell
  // expands — this prevents blurry-scaled-text choppiness.
  const cloneChild = shell.firstElementChild as HTMLElement | null;
  if (cloneChild) {
    cloneChild.style.willChange = "opacity";
    if (typeof cloneChild.animate === "function") {
      cloneChild.animate([{ opacity: "1" }, { opacity: "0" }], {
        duration: Math.round(OPEN_FLIP_DURATION_MS * 0.35),
        easing: "ease-in",
        fill: "forwards",
      });
    } else {
      cloneChild.style.opacity = "0";
    }
  }

  const previousVisibility = sourceElement.style.visibility;
  sourceElement.style.visibility = "hidden";

  try {
    const cardAnimation = playWAAPI(shell, [
      { transform: startTransform, borderRadius: `${Math.round(firstRadius)}px`, opacity: "1", offset: 0 },
      { transform: midTransform, borderRadius: `${midRadius}px`, opacity: "1", offset: 0.72 },
      { transform: endTransform, borderRadius: "0px", opacity: "1", offset: 1 },
    ], {
      duration: OPEN_FLIP_DURATION_MS,
      easing: OPEN_FLIP_EASING,
      fill: "forwards",
    });

    const overlayAnimation = playWAAPI(backdrop, [
      { opacity: "0" },
      { opacity: "1" },
    ], {
      duration: 300,
      easing: OPEN_FLIP_EASING,
      fill: "forwards",
    });

    const navigatePromise = Promise.resolve(navigate());
    await Promise.all([cardAnimation, overlayAnimation]);
    await Promise.race([waitForPath(targetPath, 950), wait(180)]);
    await navigatePromise;
  } finally {
    sourceElement.style.visibility = previousVisibility;
    root.remove();
  }
}

export async function runVenueGameReturnTransition({ gameKey, navigate }: ReturnTransitionArgs): Promise<void> {
  setVenueTransitionGate(RETURN_GATE_DURATION_MS);

  if (typeof window === "undefined" || typeof document === "undefined" || prefersReducedMotion()) {
    await Promise.resolve(navigate());
    return;
  }

  const sourceSurface = document.querySelector<HTMLElement>("[data-venue-game-surface]");
  const snapshot = readCardViewportSnapshot(gameKey);
  if (!sourceSurface || !snapshot) {
    await Promise.resolve(navigate());
    void animateVenueCardSettle(gameKey);
    return;
  }

  const firstRect = sourceSurface.getBoundingClientRect();
  if (firstRect.width <= 0 || firstRect.height <= 0) {
    await Promise.resolve(navigate());
    void animateVenueCardSettle(gameKey);
    return;
  }

  const lastRect = getRectFromSnapshot(snapshot);
  const translateX = Math.round(lastRect.left - firstRect.left);
  const translateY = Math.round(lastRect.top - firstRect.top);
  const scaleX = clamp(lastRect.width / Math.max(1, firstRect.width), 0.06, 1);
  const scaleY = clamp(lastRect.height / Math.max(1, firstRect.height), 0.08, 1);
  const midTranslateX = Math.round(translateX * 0.42);
  const midTranslateY = Math.round(translateY * 0.42);
  const midScaleX = clamp(1 + (scaleX - 1) * 0.42, 0.06, 1);
  const midScaleY = clamp(1 + (scaleY - 1) * 0.42, 0.08, 1);
  const preScale = 1.012;
  const startRadius = resolveElementRadiusPx(sourceSurface, 0);
  const endRadius = clamp(snapshot.borderRadiusPx, 8, 56);
  const startTransform = "translate3d(0px, 0px, 0) scale(1, 1)";
  const preTransform = `translate3d(0px, 0px, 0) scale(${preScale}, ${preScale})`;
  const midTransform = `translate3d(${midTranslateX}px, ${midTranslateY}px, 0) scale(${midScaleX}, ${midScaleY})`;
  const endTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;

  const sourcePath = window.location.pathname;
  const previousStyles = {
    transformOrigin: sourceSurface.style.transformOrigin,
    willChange: sourceSurface.style.willChange,
    pointerEvents: sourceSurface.style.pointerEvents,
    transition: sourceSurface.style.transition,
    overflow: sourceSurface.style.overflow,
    zIndex: sourceSurface.style.zIndex,
    position: sourceSurface.style.position,
    transform: sourceSurface.style.transform,
    borderRadius: sourceSurface.style.borderRadius,
    opacity: sourceSurface.style.opacity,
  };

  sourceSurface.style.transformOrigin = "top left";
  sourceSurface.style.willChange = "transform, border-radius, opacity";
  sourceSurface.style.pointerEvents = "none";
  sourceSurface.style.overflow = "hidden";
  sourceSurface.style.zIndex = "2000";

  try {
    const shrinkAnimation = playWAAPI(sourceSurface, [
      { transform: startTransform, borderRadius: `${Math.round(startRadius)}px`, opacity: "1", offset: 0 },
      { transform: preTransform, borderRadius: `${Math.round(startRadius)}px`, opacity: "1", offset: 0.06 },
      { transform: midTransform, borderRadius: `${Math.round(Math.max(6, endRadius * 1.2))}px`, opacity: "0.88", offset: 0.52 },
      { transform: endTransform, borderRadius: `${Math.round(endRadius)}px`, opacity: "0", offset: 1 },
    ], {
      duration: RETURN_FLIP_DURATION_MS,
      easing: RETURN_FLIP_EASING,
      fill: "forwards",
    });

    await shrinkAnimation;
    await Promise.resolve(navigate());
    await wait(16);
  } finally {
    if (window.location.pathname === sourcePath) {
      sourceSurface.style.transformOrigin = previousStyles.transformOrigin;
      sourceSurface.style.willChange = previousStyles.willChange;
      sourceSurface.style.pointerEvents = previousStyles.pointerEvents;
      sourceSurface.style.transition = previousStyles.transition;
      sourceSurface.style.overflow = previousStyles.overflow;
      sourceSurface.style.zIndex = previousStyles.zIndex;
      sourceSurface.style.position = previousStyles.position;
      sourceSurface.style.transform = previousStyles.transform;
      sourceSurface.style.borderRadius = previousStyles.borderRadius;
      sourceSurface.style.opacity = previousStyles.opacity;
    }
  }

  void animateVenueCardSettle(gameKey);
}
