// Partner Self-Serve Signup — shared contract.
//
// Phase 0 (docs/partner-self-serve-signup-plan.md §4): the master flag + reader,
// and the shared types/constants the six-screen wizard, the public map/Places
// routes and POST /api/owner/signup all consume. No UI, no DB access here.
//
// Pure and dependency-light so it is safe in the edge runtime and the browser:
// no `server-only`, no Node built-ins, only NEXT_PUBLIC_* `process.env` reads
// (inlined at build time). Same reversible convention as lib/domainSplit.ts —
// with the flag off, /owner/register keeps today's venue-lookup behavior and
// every /api/signup/* route 404s.

import type { RadiusPreset } from "@/lib/geofenceEditor";

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag. Off (the default) = today's `/owner/register` venue-lookup flow,
 * fully inert; the public `/api/signup/*` routes are not reachable. On = the
 * self-serve `/owner/signup` wizard. This is the single reader — do not read
 * `process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` anywhere else.
 */
export const isSelfServeSignupEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED);

/**
 * Where "Create an owner account" / the `/info` partner CTA points.
 *
 * Flag on → the self-serve `/owner/signup` wizard. Flag off → today's
 * `/owner/register` venue-lookup page. Both live on the apex host (only `/`
 * relocates under the domain split), so this is always a relative path and needs
 * no `marketingHref` wrapping. Phase 7 (docs/partner-self-serve-signup-plan.md):
 * `/owner/register` itself redirects here when the flag is on, so a stale link is
 * harmless — but new links should call this so they land on the wizard directly.
 */
export const signupEntryPath = (): string =>
  isSelfServeSignupEnabled() ? "/owner/signup" : "/owner/register";

// --- Radius bounds (self-serve only) -----------------------------------------
//
// Admin keeps lib/geofenceEditor.ts's 25–2000 m. Self-serve is deliberately
// tighter: a stranger picking their own geofence should not be able to draw a
// 2 km circle. Phase 2 threads these through the radius math as optional
// min/max args (default = admin constants, bit-identical for existing callers).

export const SIGNUP_RADIUS_MIN = 50;
export const SIGNUP_RADIUS_MAX = 200;

/** Default pin radius for a fresh signup draft (matches admin's 150 m default). */
export const SIGNUP_RADIUS_DEFAULT = 150;

// One-tap shortcut chips for the signup radius dial. Phase 2 wires RadiusDial to
// take a `presets` prop instead of importing RADIUS_PRESETS directly so signup
// shows these instead of admin's 150/300/600.
export const SIGNUP_RADIUS_PRESETS: ReadonlyArray<RadiusPreset> = [
  { value: 50, label: "Just the building", hint: "Bar only" },
  { value: 100, label: "Bar and patio", hint: "Indoor + patio" },
  { value: 150, label: "Standard", hint: "Most bars & restaurants" },
  { value: 200, label: "Patio and parking", hint: "Big floor + lot" },
];

/**
 * How close a pin has to be to an existing venue before POST /api/owner/signup
 * (Phase 5) stops and asks "is this your venue?" instead of creating a second
 * row for one bar.
 *
 * 150 m is deliberately wider than SIGNUP_RADIUS_MAX: two bars on the same block
 * are a real thing, but a partner standing in the wrong corner of their own
 * parking lot is far more common, and the wrong answer here is a duplicate venue
 * that splits one bar's leaderboard in two. The false-positive costs one extra
 * tap ("this isn't my venue" → move the pin); the false-negative is a support
 * ticket and a data migration.
 *
 * It shares the value of SIGNUP_RADIUS_DEFAULT by coincidence, not by meaning —
 * they are unrelated and must not be collapsed into one constant.
 */
export const SIGNUP_DUPLICATE_RADIUS_METERS = 150;

// --- Price display ----------------------------------------------------------

/**
 * The subscription price as the wizard shows it, split so the review card and
 * the footer button read from ONE place rather than two literals that can drift.
 *
 * This is DISPLAY COPY, not the source of truth: the real amount lives in the
 * Stripe price the Checkout session is created from, and /owner/billing renders
 * whatever Stripe reports. It matches the same literal /owner/billing/setup and
 * /info already show. If the plan price changes, this is one of the four places
 * to update — grep for "$100".
 */
export const SIGNUP_PRICE_LABEL = { amount: "$100", period: "/mo" } as const;

// --- Wizard step model ------------------------------------------------------

// One question per screen, in order. `review` submits the draft (nothing is
// written to the DB before that). Phase 3/4 render these; Phase 5 validates the
// assembled draft server-side.
export const SIGNUP_STEPS = [
  "name",
  "email",
  "password",
  "address",
  "geofence",
  "review",
] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

// --- Draft state (client-held until the review screen submits) --------------

// Persisted to sessionStorage between steps so a backgrounded phone doesn't lose
// the form — EXCEPT `password`, which is held in memory only and never written
// to storage (Phase 4).
export type SignupDraft = {
  // Step 1–3: the owner account.
  name: string;
  email: string;
  password: string;

  // Step 4: address + venue identity. `venueName` auto-fills from a Places
  // business prediction (the `/^\d/` test from `businessNameFromPrediction` in
  // ActivateVenueFlow.tsx) and stays editable. `country` is locked to
  // DEFAULT_VENUE_COUNTRY ("United States") — rendered, never collected.
  venueName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  placeId: string;

  // Step 4/5: coordinates. Seeded from the Places result; "Use my current
  // location" overrides them. `null` until a pin exists.
  latitude: number | null;
  longitude: number | null;

  // Step 5: the geofence radius in metres, clamped to
  // SIGNUP_RADIUS_MIN..SIGNUP_RADIUS_MAX.
  radius: number;
};

/** A fresh, empty draft. */
export const BLANK_SIGNUP_DRAFT: SignupDraft = {
  name: "",
  email: "",
  password: "",
  venueName: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  placeId: "",
  latitude: null,
  longitude: null,
  radius: SIGNUP_RADIUS_DEFAULT,
};

// --- Validation (Phase 4 client gate, Phase 5 server gate) ------------------
//
// Pure, dependency-free, and deliberately shared: the wizard uses these to
// decide whether a step may advance, and POST /api/owner/signup (Phase 5) must
// use `validateSignupDraft` on the assembled payload. A client-only check is a
// UX affordance, never a gate — but two different rule sets would be worse than
// either, so there is one.

// --- Field length caps (Phase 5a §2) ----------------------------------------
//
// `POST /api/owner/signup` is a public, unauthenticated write whose fields land
// in `venues.name` (a `text` column) and are then rendered in the player venue
// list and on the venue TV screen. The rate limiter caps the RATE of that write
// at 5/hour per IP; it caps none of the SIZE. Without these, one request can
// carry a multi-megabyte venue name into a column two customer-facing surfaces
// render.
//
// These live here — beside the validation the wizard already shares with the
// route — so the input `maxLength` and the server's gate read ONE number rather
// than two literals that drift. `signupStepIssue` enforces them, so an
// over-length field surfaces as the same footer hint on the same screen as any
// other problem, and `validateSignupDraft` enforces them server-side for a body
// that never went through an input at all.
//
// REJECT, NEVER TRUNCATE. Silently storing a clipped venue name is worse than
// telling the partner it is too long: they would discover the clipping on the
// TV screen, in front of customers.
export const SIGNUP_FIELD_LIMITS = {
  name: 120,
  /** RFC 5321's maximum forward-path length. */
  email: 254,
  /** bcrypt-adjacent inputs should be bounded; the wizard's input matches. */
  password: 200,
  venueName: 120,
  street: 200,
  city: 100,
  state: 2,
  zipCode: 10,
  /** Google's own cap, mirrored from /api/signup/places. Never user-typed. */
  placeId: 512,
} as const satisfies Partial<Record<keyof SignupDraft, number>>;

/**
 * Max length of the free-text address query the wizard sends to
 * `POST /api/signup/places`. Not a persisted `SignupDraft` field — it is the
 * autocomplete search box — so it lives here rather than in `SIGNUP_FIELD_LIMITS`,
 * but the route and the `<input maxLength>` must agree, so it has one home.
 */
export const SIGNUP_PLACES_QUERY_MAX_LENGTH = 200;

/**
 * Hard cap on the raw request body of `POST /api/owner/signup`, in bytes.
 *
 * Vercel accepts request bodies up to 100 MB; nothing else stops a 100 MB POST
 * reaching `request.json()`. The full draft with every field at its limit is
 * well under 2 KB, so 16 KB is ~8x headroom and still refuses the body before
 * it is parsed.
 */
export const SIGNUP_MAX_BODY_BYTES = 16 * 1024;

/** `null`, or the partner-facing reason this field is too long. */
export const signupFieldTooLong = (
  field: keyof typeof SIGNUP_FIELD_LIMITS,
  value: string,
  label: string
): string | null => {
  const max = SIGNUP_FIELD_LIMITS[field];
  return value.length > max ? `${label} is too long — use ${max} characters or fewer.` : null;
};

/** Matches /api/owner/auth/register's floor. Do not raise one without the other. */
export const SIGNUP_PASSWORD_MIN_LENGTH = 8;

/** Same shape /api/owner/auth/register accepts, so a draft that passes here passes there. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidSignupEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim());

/** A draft has a pin once BOTH coordinates are real numbers in range. */
export const hasSignupPin = (draft: SignupDraft): boolean =>
  draft.latitude !== null &&
  draft.longitude !== null &&
  Number.isFinite(draft.latitude) &&
  Number.isFinite(draft.longitude) &&
  draft.latitude >= -90 &&
  draft.latitude <= 90 &&
  draft.longitude >= -180 &&
  draft.longitude <= 180;

/** Street + city + state + ZIP, all present. The geofence runs off the pin, not this. */
export const hasSignupAddress = (draft: SignupDraft): boolean =>
  Boolean(draft.street.trim() && draft.city.trim() && draft.state.trim() && draft.zipCode.trim());

/**
 * What is stopping this step from advancing, in words a bar owner can act on —
 * or `null` when the step is complete.
 *
 * It returns a MESSAGE rather than a boolean on purpose. The wizard leaves Next
 * enabled and surfaces this on tap (the same call ActivateVenueFlow makes: a
 * disabled Continue button silently does nothing, and the partner is left
 * guessing which of five fields is wrong).
 */
export function signupStepIssue(step: SignupStep, draft: SignupDraft): string | null {
  switch (step) {
    case "name":
      if (draft.name.trim().length < 2) return "Add your name so we know who to address.";
      return signupFieldTooLong("name", draft.name, "Your name");
    case "email": {
      // Length BEFORE the pattern: a megabyte-long local part still matches
      // EMAIL_PATTERN, so the pattern is not a size gate.
      const tooLong = signupFieldTooLong("email", draft.email, "That email");
      if (tooLong) return tooLong;
      return isValidSignupEmail(draft.email) ? null : "That email doesn't look right — check for a typo.";
    }
    case "password": {
      // Validate the TRIMMED value: the server persists `text(body.password)`
      // (trimmed, matching /api/owner/auth/login), so gating on the raw length
      // here would advance a password the POST then rejects — and that 400
      // lands on the review footer, four steps from this field, with no
      // route-back (only `email_taken` is routed to its step).
      const password = draft.password.trim();
      if (password.length < SIGNUP_PASSWORD_MIN_LENGTH) {
        return `Use at least ${SIGNUP_PASSWORD_MIN_LENGTH} characters.`;
      }
      return signupFieldTooLong("password", password, "That password");
    }
    case "address": {
      if (!draft.venueName.trim()) return "Add the venue name players will see.";
      if (!hasSignupAddress(draft)) return "Add a street, city, state and ZIP so players see where this is.";
      const tooLong =
        signupFieldTooLong("venueName", draft.venueName, "That venue name") ??
        signupFieldTooLong("street", draft.street, "That street address") ??
        signupFieldTooLong("city", draft.city, "That city") ??
        signupFieldTooLong("zipCode", draft.zipCode, "That ZIP code");
      if (tooLong) return tooLong;
      if (draft.state.trim().length > SIGNUP_FIELD_LIMITS.state) {
        return "Use the two-letter state abbreviation (CO, TX…).";
      }
      // Never typed by a partner — it comes from a Places prediction — so an
      // over-length value means the lookup or the body is malformed, and the
      // only useful instruction is to search the address again.
      if (draft.placeId.length > SIGNUP_FIELD_LIMITS.placeId) {
        return "Something went wrong with the address lookup — search for your address again.";
      }
      return null;
    }
    case "geofence":
      if (!hasSignupPin(draft)) {
        return "Set the pin — tap “Use my current location” while you're standing in the venue.";
      }
      return draft.radius >= SIGNUP_RADIUS_MIN && draft.radius <= SIGNUP_RADIUS_MAX
        ? null
        : `The geofence must be between ${SIGNUP_RADIUS_MIN} and ${SIGNUP_RADIUS_MAX} m.`;
    case "review":
      return null;
    default:
      return null;
  }
}

/**
 * Every step's rule, in order — the whole-draft gate.
 *
 * Phase 5 (`POST /api/owner/signup`) must call this on the parsed body before
 * touching Supabase. The client bound is not a gate: `createAdminVenue` only
 * clamps to the ADMIN 25–2000 m range, so the 50–200 m rule exists nowhere else
 * on the server path.
 */
export function validateSignupDraft(draft: SignupDraft): string | null {
  for (const step of SIGNUP_STEPS) {
    const issue = signupStepIssue(step, draft);
    if (issue) return issue;
  }
  return null;
}
