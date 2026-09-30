// First-visit hint for the dashboard's logo menu button (plan decision 2): the
// ☰ badge pulses a few times, once per browser. The "seen" flag lives in
// localStorage — cosmetic only, so every access is wrapped and a blocked or
// empty store just means the partner sees the pulse again.

export const OWNER_MENU_HINT_KEY = "ht_owner_menu_hint_seen";

type HintStorage = Pick<Storage, "getItem" | "setItem">;

/** True exactly once per browser: the first call finds no flag and sets it. */
export const consumeMenuHint = (storage: HintStorage | null): boolean => {
  if (!storage) return false;
  try {
    if (storage.getItem(OWNER_MENU_HINT_KEY)) return false;
    storage.setItem(OWNER_MENU_HINT_KEY, "1");
    return true;
  } catch {
    return false;
  }
};

// Decided once per page load so every re-render sees the same answer (a second
// read would find the flag we just wrote and stop the pulse mid-animation).
let decided: boolean | null = null;

export const menuHintForThisVisit = (): boolean => {
  if (decided === null) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    decided = consumeMenuHint(storage);
  }
  return decided;
};

/** Test hook: forget this page load's decision. */
export const resetMenuHintDecision = (): void => {
  decided = null;
};
