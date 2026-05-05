"use client";

type ScrollLockMode = "modal" | "popup";

type OwnerMap = Record<string, ScrollLockMode>;

type FixedSnapshot = {
  scrollY: number;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflow: string;
  bodyTouchAction: string;
  rootOverflow: string;
  rootTouchAction: string;
};

type ScrollLockState = {
  owners: OwnerMap;
  fixedSnapshot: FixedSnapshot | null;
};

declare global {
  interface Window {
    __tpScrollLockState?: ScrollLockState;
  }
}

function getState(): ScrollLockState | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.__tpScrollLockState) {
    window.__tpScrollLockState = {
      owners: {},
      fixedSnapshot: null,
    };
  }
  return window.__tpScrollLockState;
}

function hasAnyLocks(state: ScrollLockState): boolean {
  return Object.keys(state.owners).length > 0;
}

function hasPopupLock(state: ScrollLockState): boolean {
  return Object.values(state.owners).some((mode) => mode === "popup");
}

function captureFixedSnapshot(): FixedSnapshot {
  const body = document.body;
  const root = document.documentElement;
  return {
    scrollY: window.scrollY,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverflow: body.style.overflow,
    bodyTouchAction: body.style.touchAction,
    rootOverflow: root.style.overflow,
    rootTouchAction: root.style.touchAction,
  };
}

function applyFixedBodyLock(snapshot: FixedSnapshot): void {
  const body = document.body;
  const root = document.documentElement;
  body.style.position = "fixed";
  body.style.top = `-${snapshot.scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  root.style.overflow = "hidden";
}

function restoreFixedBodyLock(snapshot: FixedSnapshot): void {
  const body = document.body;
  const root = document.documentElement;

  body.style.position = snapshot.bodyPosition;
  body.style.top = snapshot.bodyTop;
  body.style.left = snapshot.bodyLeft;
  body.style.right = snapshot.bodyRight;
  body.style.width = snapshot.bodyWidth;
  body.style.overflow = snapshot.bodyOverflow;
  body.style.touchAction = snapshot.bodyTouchAction;
  root.style.overflow = snapshot.rootOverflow;
  root.style.touchAction = snapshot.rootTouchAction;

  window.scrollTo(0, snapshot.scrollY);
}

function forceUnlockDocumentScrollState(): void {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  const root = document.documentElement;

  body.classList.remove("tp-modal-open", "tp-popup-open");
  root.classList.remove("tp-modal-open", "tp-popup-open");

  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "";
  body.style.touchAction = "";

  root.style.overflow = "";
  root.style.touchAction = "";
}

function applyScrollLockState(state: ScrollLockState): void {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  const root = document.documentElement;
  const locked = hasAnyLocks(state);
  const popupLocked = hasPopupLock(state);

  if (!locked) {
    body.classList.remove("tp-modal-open", "tp-popup-open");
    root.classList.remove("tp-modal-open", "tp-popup-open");
    if (state.fixedSnapshot) {
      restoreFixedBodyLock(state.fixedSnapshot);
      state.fixedSnapshot = null;
    } else {
      forceUnlockDocumentScrollState();
    }
    return;
  }

  body.classList.add("tp-modal-open");
  root.classList.add("tp-modal-open");

  if (popupLocked) {
    body.classList.add("tp-popup-open");
    root.classList.add("tp-popup-open");
    if (!state.fixedSnapshot) {
      state.fixedSnapshot = captureFixedSnapshot();
    }
    applyFixedBodyLock(state.fixedSnapshot);
    return;
  }

  body.classList.remove("tp-popup-open");
  root.classList.remove("tp-popup-open");
  if (state.fixedSnapshot) {
    restoreFixedBodyLock(state.fixedSnapshot);
    state.fixedSnapshot = null;
  }
}

export function setScrollLock(owner: string, active: boolean, mode: ScrollLockMode = "modal"): void {
  if (!owner || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const state = getState();
  if (!state) {
    return;
  }
  const key = owner.trim();
  if (!key) {
    return;
  }

  if (active) {
    state.owners[key] = mode;
  } else {
    delete state.owners[key];
  }
  applyScrollLockState(state);
}

export function hasActiveScrollLocks(): boolean {
  const state = getState();
  if (!state) {
    return false;
  }
  return hasAnyLocks(state);
}

export function forceRecoverDocumentScroll(): void {
  const state = getState();
  if (!state) {
    return;
  }
  state.owners = {};
  state.fixedSnapshot = null;
  forceUnlockDocumentScrollState();
}
