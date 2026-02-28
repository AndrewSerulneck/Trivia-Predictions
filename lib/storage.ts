const STORAGE_KEYS = {
  venueId: "tp:venue-id",
  username: "tp:username",
  userId: "tp:user-id",
};

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const safeName = encodeURIComponent(name);
  const safeValue = encodeURIComponent(value);
  document.cookie = `${safeName}=${safeValue}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  const safeName = encodeURIComponent(name);
  document.cookie = `${safeName}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function saveVenueId(venueId: string): void {
  localStorage.setItem(STORAGE_KEYS.venueId, venueId);
  setCookie("tp_venue_id", venueId);
}

export function getVenueId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.venueId);
}

export function saveUsername(username: string): void {
  localStorage.setItem(STORAGE_KEYS.username, username);
}

export function getUsername(): string | null {
  return localStorage.getItem(STORAGE_KEYS.username);
}

export function saveUserId(userId: string): void {
  localStorage.setItem(STORAGE_KEYS.userId, userId);
  setCookie("tp_user_id", userId);
}

export function getUserId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.userId);
}

export function clearVenueSession(): void {
  localStorage.removeItem(STORAGE_KEYS.venueId);
  localStorage.removeItem(STORAGE_KEYS.username);
  localStorage.removeItem(STORAGE_KEYS.userId);
  clearCookie("tp_venue_id");
  clearCookie("tp_user_id");
}
