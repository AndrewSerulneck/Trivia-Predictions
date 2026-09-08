import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { passwordStrength } from "@/components/signup/steps/PasswordStep";
import {
  clearSignupDraft,
  readSignupDraft,
  signupDraftHasAnswers,
  writeSignupDraft,
} from "@/components/signup/signupDraft";
import {
  BLANK_SIGNUP_DRAFT,
  SIGNUP_PASSWORD_MIN_LENGTH,
  SIGNUP_RADIUS_MAX,
  SIGNUP_RADIUS_MIN,
  isValidSignupEmail,
  signupStepIssue,
  validateSignupDraft,
  type SignupDraft,
} from "@/lib/selfServeSignup";

/**
 * Partner Self-Serve Signup, Phase 4 — the six question screens.
 * docs/partner-self-serve-signup-plan.md §4.
 *
 * Phase 4 is mostly UI that only a real phone can judge (that is what
 * docs/self-serve-signup-device-checklist.md is for). These are the two pieces
 * that are pure logic and that a mistake in would be genuinely costly:
 *
 *   1. THE PASSWORD MUST NEVER REACH sessionStorage. `password` is a field on
 *      SignupDraft, so persisting the object wholesale leaks a plaintext
 *      password into web storage. Nothing about the UI would look wrong.
 *   2. The step gate, which Phase 5's POST /api/owner/signup reuses verbatim as
 *      its server-side validator — so a hole here is a hole in the API.
 *
 * Phase 8 owns tests/self-serve-signup-contract.test.ts (route auth, radius
 * bounds, rate limiter). Keep this file to draft + validation.
 */

const DRAFT_KEY = "hc_signup_draft";

// Minimal sessionStorage. The suite runs in the `node` environment, so there is
// no window at all — which is also the first thing signupDraft.ts guards for.
class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const filledDraft = (over: Partial<SignupDraft> = {}): SignupDraft => ({
  ...BLANK_SIGNUP_DRAFT,
  name: "Alex Rivera",
  email: "alex@murphys.com",
  password: "correct-horse-battery",
  venueName: "Murphy's Tap House",
  street: "1200 Larimer St",
  city: "Denver",
  state: "CO",
  zipCode: "80204",
  placeId: "place-123",
  latitude: 39.7508,
  longitude: -104.9966,
  radius: 150,
  ...over,
});

describe("signup draft persistence", () => {
  it("never writes the password to storage", () => {
    writeSignupDraft(filledDraft());
    const raw = storage.getItem(DRAFT_KEY) ?? "";
    expect(raw).not.toContain("correct-horse-battery");
    expect(JSON.parse(raw)).not.toHaveProperty("password");
    // Everything else IS there — the point is a targeted omission, not a
    // half-persisted draft.
    expect(JSON.parse(raw)).toMatchObject({ email: "alex@murphys.com", venueName: "Murphy's Tap House" });
  });

  it("round-trips every other answer and returns an empty password", () => {
    const original = filledDraft();
    writeSignupDraft(original);
    const restored = readSignupDraft();
    expect(restored).toEqual({ ...original, password: "" });
  });

  it("returns a blank draft when storage is empty, unavailable or unparseable", () => {
    expect(readSignupDraft()).toEqual(BLANK_SIGNUP_DRAFT);

    storage.setItem(DRAFT_KEY, "{not json");
    expect(readSignupDraft()).toEqual(BLANK_SIGNUP_DRAFT);

    // No window at all (SSR, or a pre-hydration render).
    delete (globalThis as { window?: unknown }).window;
    expect(readSignupDraft()).toEqual(BLANK_SIGNUP_DRAFT);
  });

  it("refuses a tampered payload rather than trusting its shape", () => {
    storage.setItem(
      DRAFT_KEY,
      JSON.stringify({ name: 42, latitude: "39.75", longitude: 999, radius: 5000, password: "leaked" })
    );
    const restored = readSignupDraft();
    // Wrong types become empty/null; they never reach a component expecting a
    // string or a finite coordinate.
    expect(restored.name).toBe("");
    expect(restored.latitude).toBeNull();
    // Out-of-range longitude is dropped, not clamped — a wrong pin is worse
    // than no pin.
    expect(restored.longitude).toBeNull();
    // Radius IS clamped: it has a legitimate default and a hard domain.
    expect(restored.radius).toBe(SIGNUP_RADIUS_MAX);
    expect(restored.password).toBe("");
  });

  it("clears the draft and reports whether there is anything to lose", () => {
    expect(signupDraftHasAnswers(BLANK_SIGNUP_DRAFT)).toBe(false);
    expect(signupDraftHasAnswers({ ...BLANK_SIGNUP_DRAFT, name: "A" })).toBe(true);

    writeSignupDraft(filledDraft());
    clearSignupDraft();
    expect(readSignupDraft()).toEqual(BLANK_SIGNUP_DRAFT);
  });
});

describe("signup step gate", () => {
  it("passes a complete draft at every step", () => {
    const draft = filledDraft();
    for (const step of ["name", "email", "password", "address", "geofence", "review"] as const) {
      expect(signupStepIssue(step, draft), step).toBeNull();
    }
    expect(validateSignupDraft(draft)).toBeNull();
  });

  it("names the one thing that is missing, in a message a partner can act on", () => {
    expect(signupStepIssue("name", filledDraft({ name: "" }))).toMatch(/your name/i);
    expect(signupStepIssue("email", filledDraft({ email: "alex@" }))).toMatch(/typo/i);
    expect(signupStepIssue("password", filledDraft({ password: "short" }))).toContain(
      String(SIGNUP_PASSWORD_MIN_LENGTH)
    );
    expect(signupStepIssue("address", filledDraft({ venueName: "" }))).toMatch(/venue name/i);
    expect(signupStepIssue("address", filledDraft({ zipCode: "" }))).toMatch(/ZIP/);
    expect(signupStepIssue("geofence", filledDraft({ latitude: null }))).toMatch(/pin/i);
  });

  it("rejects a radius outside the self-serve domain", () => {
    // The client cannot produce this — GeofenceEditor clamps — but a tampered
    // sessionStorage draft or a hand-rolled POST body can, and Phase 5 uses
    // this same function as its server-side gate.
    expect(signupStepIssue("geofence", filledDraft({ radius: SIGNUP_RADIUS_MIN - 1 }))).toBeTruthy();
    expect(signupStepIssue("geofence", filledDraft({ radius: SIGNUP_RADIUS_MAX + 1 }))).toBeTruthy();
    expect(signupStepIssue("geofence", filledDraft({ radius: SIGNUP_RADIUS_MIN }))).toBeNull();
    expect(signupStepIssue("geofence", filledDraft({ radius: SIGNUP_RADIUS_MAX }))).toBeNull();
    // Admin's default is inside admin's range but outside signup's.
    expect(signupStepIssue("geofence", filledDraft({ radius: 600 }))).toBeTruthy();
  });

  it("stops on the FIRST unmet step, so the message matches the screen", () => {
    const draft = filledDraft({ name: "", email: "nope" });
    expect(validateSignupDraft(draft)).toBe(signupStepIssue("name", draft));
  });

  it("accepts the same emails /api/owner/auth/register accepts", () => {
    expect(isValidSignupEmail("alex@murphys.com")).toBe(true);
    expect(isValidSignupEmail("  alex@murphys.com  ")).toBe(true);
    expect(isValidSignupEmail("alex@")).toBe(false);
    expect(isValidSignupEmail("alex murphys.com")).toBe(false);
    expect(isValidSignupEmail("")).toBe(false);
  });
});

describe("password strength rail", () => {
  it("shows nothing until the hard rule is met, then never accuses", () => {
    // Below the floor the rail is inert — the error text carries the message.
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("a".repeat(SIGNUP_PASSWORD_MIN_LENGTH - 1))).toBe(0);
    // At the floor it is already positive. A password that is ALLOWED must never
    // render as a failure.
    expect(passwordStrength("a".repeat(SIGNUP_PASSWORD_MIN_LENGTH))).toBeGreaterThan(0);
    expect(passwordStrength("Passw0rd!longer")).toBe(3);
    expect(passwordStrength("correct horse battery staple")).toBe(3);
  });
});
