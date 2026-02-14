const STORAGE_KEYS = {
  venueId: "tp:venue-id",
  username: "tp:username",
  userId: "tp:user-id",
};

export function saveVenueId(venueId: string): void {
  localStorage.setItem(STORAGE_KEYS.venueId, venueId);
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
}

export function getUserId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.userId);
}
