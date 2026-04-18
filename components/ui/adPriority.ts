"use client";

export type AdTier = "popup" | "mobile-adhesion" | "other";

type ActiveAdState = {
  tier: AdTier | null;
  ownerId: string | null;
  landingPopupGate: boolean;
};

type WindowWithAdState = Window & {
  __tpActiveAdState?: ActiveAdState;
};

const CHANGE_EVENT = "tp:active-ad-change";

function getPriority(tier: AdTier): number {
  if (tier === "popup") return 3;
  if (tier === "mobile-adhesion") return 2;
  return 1;
}

function getWindowState(): ActiveAdState {
  if (typeof window === "undefined") {
    return { tier: null, ownerId: null, landingPopupGate: false };
  }
  const typedWindow = window as WindowWithAdState;
  if (!typedWindow.__tpActiveAdState) {
    typedWindow.__tpActiveAdState = { tier: null, ownerId: null, landingPopupGate: false };
  }
  return typedWindow.__tpActiveAdState;
}

function emitChange(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function requestAdTier(tier: AdTier, ownerId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const state = getWindowState();
  if (state.ownerId === ownerId) {
    if (state.tier !== tier) {
      state.tier = tier;
      emitChange();
    }
    return true;
  }

  if (!state.tier || !state.ownerId) {
    state.tier = tier;
    state.ownerId = ownerId;
    emitChange();
    return true;
  }

  const activePriority = getPriority(state.tier);
  const requestPriority = getPriority(tier);
  if (requestPriority > activePriority) {
    state.tier = tier;
    state.ownerId = ownerId;
    emitChange();
    return true;
  }

  return false;
}

export function releaseAdTier(ownerId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const state = getWindowState();
  if (state.ownerId !== ownerId) {
    return;
  }
  state.tier = null;
  state.ownerId = null;
  emitChange();
}

export function subscribeAdTierChange(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function setLandingPopupGate(active: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  const state = getWindowState();
  const next = Boolean(active);
  if (state.landingPopupGate === next) {
    return;
  }
  state.landingPopupGate = next;
  emitChange();
}

export function isLandingPopupGateActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(getWindowState().landingPopupGate);
}
