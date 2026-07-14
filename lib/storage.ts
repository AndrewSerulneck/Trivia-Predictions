const STORAGE_KEYS = {
  venueId: "tp:venue-id",
  username: "tp:username",
  userId: "tp:user-id",
  accountId: "tp:account-id",
  godMode: "tp:god-mode",
};

export const AUTH_STATE_CHANGED_EVENT = "tp:auth-state-changed";
export const AUTH_STATE_RESET_EVENT = "tp:auth-state-reset";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const memoryStore: Record<string, string> = {};

function clearManagedLocalStorageKeys(): void {
  removeLocalStorage(STORAGE_KEYS.venueId);
  removeLocalStorage(STORAGE_KEYS.username);
  removeLocalStorage(STORAGE_KEYS.userId);
  removeLocalStorage(STORAGE_KEYS.accountId);
  removeLocalStorage(STORAGE_KEYS.godMode);
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const safeName = encodeURIComponent(name);
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const chunk of cookies) {
    const [rawKey, ...valueParts] = chunk.trim().split("=");
    if (rawKey !== safeName) {
      continue;
    }
    try {
      return decodeURIComponent(valueParts.join("="));
    } catch {
      return valueParts.join("=");
    }
  }
  return null;
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore browser storage failures (private mode / strict privacy settings).
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore browser storage failures.
  }
}

// Phase 6 domain split: when set (e.g. `.hightopchallenge.com`), scope cookies to
// the parent domain so a session set on the apex stays valid on `play.`. Empty
// by default → host-only cookies (localhost/preview keep working untouched).
function cookieDomainAttr(): string {
  const domain = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? "").trim();
  return domain ? `; Domain=${domain}` : "";
}

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const safeName = encodeURIComponent(name);
  const safeValue = encodeURIComponent(value);
  document.cookie = `${safeName}=${safeValue}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${cookieDomainAttr()}`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  const safeName = encodeURIComponent(name);
  document.cookie = `${safeName}=; Max-Age=0; Path=/; SameSite=Lax${cookieDomainAttr()}`;
}

function dispatchAuthStateEvent(type: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(type));
  } catch {
    // Ignore event dispatch failures.
  }
}

export function saveVenueId(venueId: string): void {
  memoryStore[STORAGE_KEYS.venueId] = venueId;
  writeLocalStorage(STORAGE_KEYS.venueId, venueId);
  setCookie("tp_venue_id", venueId);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}

export function getVenueId(): string | null {
  const memoryValue = memoryStore[STORAGE_KEYS.venueId];
  if (memoryValue) return memoryValue;
  const localValue = readLocalStorage(STORAGE_KEYS.venueId);
  if (localValue) return localValue;
  return readCookie("tp_venue_id");
}

export function saveUsername(username: string): void {
  memoryStore[STORAGE_KEYS.username] = username;
  writeLocalStorage(STORAGE_KEYS.username, username);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}

export function getUsername(): string | null {
  const memoryValue = memoryStore[STORAGE_KEYS.username];
  if (memoryValue) return memoryValue;
  return readLocalStorage(STORAGE_KEYS.username);
}

export function saveUserId(userId: string): void {
  memoryStore[STORAGE_KEYS.userId] = userId;
  writeLocalStorage(STORAGE_KEYS.userId, userId);
  setCookie("tp_user_id", userId);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}

export function getUserId(): string | null {
  const memoryValue = memoryStore[STORAGE_KEYS.userId];
  if (memoryValue) return memoryValue;
  const localValue = readLocalStorage(STORAGE_KEYS.userId);
  if (localValue) return localValue;
  return readCookie("tp_user_id");
}

export function saveAccountId(accountId: string): void {
  memoryStore[STORAGE_KEYS.accountId] = accountId;
  writeLocalStorage(STORAGE_KEYS.accountId, accountId);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}

export function getAccountId(): string | null {
  const memoryValue = memoryStore[STORAGE_KEYS.accountId];
  if (memoryValue) return memoryValue;
  return readLocalStorage(STORAGE_KEYS.accountId);
}

export function saveGodMode(value: boolean): void {
  const str = value ? "1" : "0";
  memoryStore[STORAGE_KEYS.godMode] = str;
  writeLocalStorage(STORAGE_KEYS.godMode, str);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}

export function getGodMode(): boolean {
  const memoryValue = memoryStore[STORAGE_KEYS.godMode];
  if (memoryValue !== undefined) return memoryValue === "1";
  return readLocalStorage(STORAGE_KEYS.godMode) === "1";
}

export function clearVenueSession(): void {
  clearClientState();
}

export function clearClientState(): void {
  // Let analytics flush final session/game durations before sessionStorage and
  // cookies are cleared.
  dispatchAuthStateEvent(AUTH_STATE_RESET_EVENT);
  delete memoryStore[STORAGE_KEYS.venueId];
  delete memoryStore[STORAGE_KEYS.username];
  delete memoryStore[STORAGE_KEYS.userId];
  delete memoryStore[STORAGE_KEYS.accountId];
  delete memoryStore[STORAGE_KEYS.godMode];
  if (typeof window !== "undefined") {
    try {
      clearManagedLocalStorageKeys();
    } catch {
      clearManagedLocalStorageKeys();
    }
    try {
      window.sessionStorage.clear();
    } catch {
      // Ignore session storage clear failures.
    }
  }
  clearCookie("tp_venue_id");
  clearCookie("tp_user_id");
  dispatchAuthStateEvent(AUTH_STATE_RESET_EVENT);
  dispatchAuthStateEvent(AUTH_STATE_CHANGED_EVENT);
}
