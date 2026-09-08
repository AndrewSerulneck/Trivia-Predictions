"use client";

import {
  BLANK_SIGNUP_DRAFT,
  SIGNUP_RADIUS_MAX,
  SIGNUP_RADIUS_MIN,
  type SignupDraft,
} from "@/lib/selfServeSignup";

// Partner Self-Serve Signup — draft persistence.
//
// Phase 4 (docs/partner-self-serve-signup-plan.md §4): "Draft state persists to
// sessionStorage so a backgrounded phone doesn't lose the form. Never persist
// the password — hold it in memory only."
//
// THE PASSWORD RULE IS THE POINT OF THIS FILE. `password` is a field on
// SignupDraft, so writing the object wholesale would put a plaintext password in
// web storage, where every script on the origin can read it and where it
// survives until the tab closes. `writeSignupDraft` destructures it out by name
// — not with a blocklist loop, so a future field is persisted by default and
// only this one is not, visibly, in review.
//
// sessionStorage, not localStorage, deliberately: the draft should die with the
// tab. A shared phone behind a bar should not offer the next person a half-typed
// signup with someone else's email in it.
//
// Nothing here throws. Safari's Private Browsing, an iOS "block all cookies"
// setting and a storage quota all make these calls throw, and a wizard that
// white-screens because it could not save a draft is a far worse outcome than
// one that quietly forgets it.

const DRAFT_KEY = "hc_signup_draft";

/** The persisted shape — SignupDraft minus the one field that must never land on disk. */
type PersistedDraft = Omit<SignupDraft, "password">;

const clampRadiusValue = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return BLANK_SIGNUP_DRAFT.radius;
  return Math.min(SIGNUP_RADIUS_MAX, Math.max(SIGNUP_RADIUS_MIN, Math.round(n)));
};

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

const asCoordinate = (value: unknown, limit: number): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= -limit && value <= limit ? value : null;
};

/**
 * Restore the draft for this tab. Returns a BLANK draft (never a partial one)
 * when there is nothing stored, storage is unavailable, or the stored value is
 * not the shape we wrote — a tampered or stale-schema payload must not be able
 * to put a string where the wizard expects a number.
 *
 * `password` always comes back "" because it was never written.
 */
export function readSignupDraft(): SignupDraft {
  if (typeof window === "undefined") return { ...BLANK_SIGNUP_DRAFT };
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return { ...BLANK_SIGNUP_DRAFT };
  }
  if (!raw) return { ...BLANK_SIGNUP_DRAFT };

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedDraft> | null;
    if (!parsed || typeof parsed !== "object") return { ...BLANK_SIGNUP_DRAFT };
    return {
      name: asText(parsed.name),
      email: asText(parsed.email),
      password: "",
      venueName: asText(parsed.venueName),
      street: asText(parsed.street),
      city: asText(parsed.city),
      state: asText(parsed.state),
      zipCode: asText(parsed.zipCode),
      placeId: asText(parsed.placeId),
      latitude: asCoordinate(parsed.latitude, 90),
      longitude: asCoordinate(parsed.longitude, 180),
      radius: clampRadiusValue(parsed.radius),
    };
  } catch {
    return { ...BLANK_SIGNUP_DRAFT };
  }
}

/** Persist everything except the password. */
export function writeSignupDraft(draft: SignupDraft): void {
  if (typeof window === "undefined") return;
  // Named destructure, not a loop over a blocklist: the omission is legible in
  // review and a field added to SignupDraft later is persisted by default.
  const { password: _password, ...persisted } = draft;
  void _password;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(persisted satisfies PersistedDraft));
  } catch {
    // Storage unavailable or full. The wizard keeps working from memory.
  }
}

/** Drop the draft — on a completed submit, or when the partner leaves deliberately. */
export function clearSignupDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do; the draft dies with the tab regardless.
  }
}

/** True when the partner has typed anything worth warning them about losing. */
export function signupDraftHasAnswers(draft: SignupDraft): boolean {
  return Boolean(
    draft.name.trim() ||
      draft.email.trim() ||
      draft.password ||
      draft.venueName.trim() ||
      draft.street.trim() ||
      draft.latitude !== null
  );
}
