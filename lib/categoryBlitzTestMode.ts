const STORAGE_KEY = "tp:category-blitz-test-mode";

function normalizeBoolean(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readBrowserToggle(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return normalizeBoolean(window.localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return false;
  }
}

export function isCategoryBlitzTestModeEnabled(): boolean {
  if (normalizeBoolean(process.env.NEXT_PUBLIC_CATEGORY_BLITZ_TEST_MODE)) {
    return true;
  }
  return readBrowserToggle();
}

export function setCategoryBlitzTestMode(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}
