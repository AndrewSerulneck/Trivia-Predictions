import { NextResponse } from "next/server";

import { createAdminVenue } from "@/lib/admin";
import { DEFAULT_VENUE_COUNTRY } from "@/lib/adminVenueForm";
import { OWNER_EMAIL_TAKEN_MESSAGE, ownerEmailExists } from "@/lib/ownerEmailAvailability";
import { createOwnerSessionCookie } from "@/lib/ownerSession";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import {
  SIGNUP_DUPLICATE_RADIUS_METERS,
  SIGNUP_MAX_BODY_BYTES,
  isSelfServeSignupEnabled,
  validateSignupDraft,
  type SignupDraft,
} from "@/lib/selfServeSignup";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  VENUE_CLAIM_COLUMNS,
  claimableDistanceMeters,
  isAdminHiddenVenueRow,
  isClaimableVenueRow,
  isSelfServeVenueRow,
  type ClaimableVenueRow,
} from "@/lib/venueClaim";

// Partner Self-Serve Signup — Phase 5 (docs/partner-self-serve-signup-plan.md §4).
//
// The one write in the whole flow. Everything the six screens collected arrives
// here in a single body and becomes four rows across three tables plus a
// Supabase auth user — with NO cross-table transaction available through the JS
// client. Every partial failure is therefore unwound by hand, in reverse, and
// each unwind is exercised by tests/api.owner.signup.test.ts. Read `unwind()`
// before changing the order of anything below it.
//
// Gate order is flag → rate limiter → validation → duplicate check → writes.
// Note this deliberately REVERSES the ordering of its /api/signup/* siblings,
// which validate before the limiter so a malformed request never spends a
// partner's Google quota. Here the limiter is not protecting a Google bill, it
// is protecting the account table: a malformed body is exactly the shape a
// scripted signup spammer sends, so it must cost a slot.

/** Client contract — components/signup/SignupWizard.tsx `submit()`. */
type SignupBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  venueName?: unknown;
  street?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  placeId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  radius?: unknown;
  /** Set only on the second POST, after the client showed "Is this your venue?". */
  claimVenueId?: unknown;
};

/**
 * The venue shape both the proximity scan and the claim lookup read, and the
 * one eligibility rule they share, live in lib/venueClaim.ts — see the module
 * header for why (they were two copies, and the claim copy was missing the
 * (0, 0) placeholder clause).
 */
type VenueProximityRow = ClaimableVenueRow;

const notFound = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

const fail = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status, headers: { "Cache-Control": "no-store" } });

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * `null` for anything that is not a real number.
 *
 * Note the explicit type guards rather than a bare `Number(value)`: `Number(null)`
 * and `Number("")` are both **0**, so the terse version silently turns a missing
 * pin into the coordinates (0, 0) — a valid, in-range point in the Gulf of
 * Guinea that `validateSignupDraft` would happily accept. The body is
 * attacker-controlled and the client sends `null` for an unset pin, so this is
 * the ordinary path, not an edge case.
 */
const coordinate = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * The raw body, or `null` when it is over SIGNUP_MAX_BODY_BYTES (Phase 5a §2).
 *
 * `Content-Length` is checked FIRST so an oversized body is refused before it is
 * read at all — Vercel accepts up to 100 MB and nothing else here would stop it.
 * The decoded length is then re-checked, because the header is absent on a
 * chunked request and is in any case sent by the caller. That second check
 * buffers what it rejects, which is the deliberate trade: refusing a header-less
 * 100 MB POST without buffering it means hand-rolling a streaming reader, and
 * every real client (browser `fetch` with a string body, `curl`) sets the
 * header.
 *
 * BOTH checks count BYTES (Finding #12). `Content-Length` is a byte count, so
 * comparing it against `raw.length` — UTF-16 code units — measured two
 * different things: a body of multi-byte characters (emoji, CJK, any accented
 * venue name) could be up to 3x the cap and still pass the second check.
 */
async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > SIGNUP_MAX_BODY_BYTES) return null;
  const raw = await request.text().catch(() => "");
  return Buffer.byteLength(raw, "utf8") > SIGNUP_MAX_BODY_BYTES ? null : raw;
}

/**
 * The submitted body as the same `SignupDraft` shape the wizard gates on, so
 * `validateSignupDraft` — the single rule set — can be applied verbatim.
 *
 * The password is TRIMMED, matching /api/owner/auth/login (which trims before
 * exchanging credentials). Storing an untrimmed password here would create an
 * account that its own owner could never sign into.
 */
function draftFromBody(body: SignupBody): SignupDraft {
  return {
    name: text(body.name),
    email: text(body.email).toLowerCase(),
    password: text(body.password),
    venueName: text(body.venueName),
    street: text(body.street),
    city: text(body.city),
    state: text(body.state).toUpperCase(),
    zipCode: text(body.zipCode),
    placeId: text(body.placeId),
    latitude: coordinate(body.latitude),
    longitude: coordinate(body.longitude),
    radius: typeof body.radius === "number" ? body.radius : Number(body.radius),
  };
}

const addressLabel = (venue: VenueProximityRow): string =>
  text(venue.address) || [text(venue.street), text(venue.city), text(venue.state)].filter(Boolean).join(", ");

/**
 * Nearest existing venue within SIGNUP_DUPLICATE_RADIUS_METERS of the pin, or
 * null.
 *
 * Postgres has no geo index here, so this is a latitude/longitude bounding box
 * (cheap, index-friendly) narrowed by real haversine distance in JS. The box is
 * a superset of the circle, never a subset, so nothing inside the radius is
 * missed.
 *
 * HIDDEN VENUES ARE INCLUDED on purpose. A hidden row is usually somebody
 * else's abandoned self-serve signup at this same address; offering it as a
 * claim is right, and the Stripe webhook reveals it on first payment exactly as
 * it would a fresh one. A hidden row this flow did NOT create is a different
 * animal — it is still returned, so the caller can refuse instead of creating a
 * duplicate, but the caller must never offer it as a claim
 * (`isAdminHiddenVenueRow`).
 *
 * Which rows qualify is `claimableDistanceMeters`, in lib/venueClaim.ts, and
 * NOT a rule written here: rows with no coordinates, and the literal (0, 0)
 * placeholder both Category Blitz global rooms use, are excluded there so the
 * claim branch below gets exactly the same answer this scan does.
 */
async function findNearbyVenue(latitude: number, longitude: number): Promise<VenueProximityRow | null> {
  const latDelta = SIGNUP_DUPLICATE_RADIUS_METERS / 111_320;
  const cosLat = Math.abs(Math.cos((latitude * Math.PI) / 180));
  const lngDelta = cosLat < 1e-6 ? 360 : SIGNUP_DUPLICATE_RADIUS_METERS / (111_320 * cosLat);

  let query = supabaseAdmin!
    .from("venues")
    .select(VENUE_CLAIM_COLUMNS)
    .gte("latitude", latitude - latDelta)
    .lte("latitude", latitude + latDelta);

  // Near a pole, or across the antimeridian, the longitude box stops being a
  // simple interval. Dropping the bound there keeps the result a superset (the
  // latitude band alone is still tiny) rather than silently missing a match.
  if (longitude - lngDelta >= -180 && longitude + lngDelta <= 180) {
    query = query.gte("longitude", longitude - lngDelta).lte("longitude", longitude + lngDelta);
  }

  // `.order` before `.limit` so a box that somehow held more than 200 venues
  // returns a deterministic, reproducible-from-a-log slice rather than an
  // arbitrary one. A 300 m box does not hold 200 venues in this product — this
  // is robustness, not a live bug — but an arbitrary slice could miss the
  // nearest match and create a duplicate venue instead of offering the claim.
  const { data, error } = await query.order("latitude", { ascending: true }).limit(200);
  if (error) {
    throw new Error(error.message ?? "Failed to check for an existing venue.");
  }

  let nearest: VenueProximityRow | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const row of (data ?? []) as VenueProximityRow[]) {
    const distance = claimableDistanceMeters(row, { latitude, longitude });
    if (distance !== null && distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/** Does any owner already hold this venue? */
async function venueHasOwner(venueId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from("venue_owner_venues")
    .select("id")
    .eq("venue_id", venueId)
    .limit(1);
  if (error) {
    throw new Error(error.message ?? "Failed to check venue ownership.");
  }
  return (data ?? []).length > 0;
}

/**
 * A venue self-serve must not touch at all: hidden, and not by this flow.
 *
 * Reuses the `venue_claimed` code deliberately — that is the client branch that
 * renders the duplicate panel WITHOUT a claim button
 * (components/signup/steps/ReviewStep.tsx `DuplicatePanel`), which is exactly
 * the affordance this case needs, so no client change is required. Only the
 * copy differs, because "already has a partner account" would be a guess.
 */
const unavailableResponse = (venue: VenueProximityRow) =>
  fail(
    "That venue isn't available for self-serve signup. " +
      "Email partnerships@hightopchallenge.com and we'll set it up for you.",
    409,
    {
      code: "venue_claimed",
      venue: { id: venue.id, name: text(venue.name) || venue.id, address: addressLabel(venue) },
    }
  );

const duplicateResponse = (venue: VenueProximityRow, claimed: boolean) =>
  fail(
    claimed
      ? "That venue already has a partner account. Sign in instead, or contact support if it should be yours."
      : "We already have this venue. Is it yours?",
    409,
    {
      code: claimed ? "venue_claimed" : "venue_available",
      venue: { id: venue.id, name: text(venue.name) || venue.id, address: addressLabel(venue) },
    }
  );

export async function POST(request: Request) {
  if (!isSelfServeSignupEnabled()) return notFound();
  if (!supabaseAdmin) {
    return fail("Server configuration error.", 500);
  }

  const limit = await rateLimit(request, "signupSubmit");
  if (!limit.allowed) return rateLimitResponse(limit);

  const raw = await readBoundedBody(request);
  if (raw === null) {
    return fail("That request was too large. Shorten your venue name and address and try again.", 413);
  }

  let body: SignupBody;
  try {
    body = (JSON.parse(raw || "{}") ?? {}) as SignupBody;
  } catch {
    body = {};
  }

  const draft = draftFromBody(body);
  const claimVenueId = text(body.claimVenueId);

  // The single rule set — the same function the wizard gates each step on, and
  // the only place on the server path where the 50–200 m signup radius exists
  // (createAdminVenue only clamps to admin's 25–2000). Its message names the
  // screen the partner would have seen.
  const issue = validateSignupDraft(draft);
  if (issue) return fail(issue, 400);

  // Mirrors normalizeVenueId() inside createAdminVenue: a name with no letters
  // or digits generates no venue id. Caught here so it is a 400 the partner can
  // act on rather than an unexplained failure four writes later.
  if (!/[a-z0-9]/i.test(draft.venueName)) {
    return fail("Add at least one letter or number to the venue name.", 400);
  }

  // Coordinates are non-null past validateSignupDraft; narrow for TypeScript.
  const latitude = draft.latitude as number;
  const longitude = draft.longitude as number;

  // --- Existing account -----------------------------------------------------
  //
  // Checked BEFORE the duplicate-venue scan, which is a deviation from the
  // plan's step order and is deliberate: if this email already has a partner
  // account, "sign in instead" is the only useful answer whatever the venue
  // geometry says, and finding that out only after tapping through "Is this
  // your venue?" would be two dead ends instead of one.
  // Same module POST /api/signup/email-available uses for the step-2 pre-check,
  // so the two can never answer differently. This one is the AUTHORITY: the
  // pre-check is skippable and can be raced, so it is re-run here before any
  // write.
  const existingOwner = await ownerEmailExists(draft.email);

  if (!existingOwner.ok) {
    console.error("[OwnerSignup] owner-lookup-failed", { message: existingOwner.message });
    return fail("Something went wrong. Please try again.", 500);
  }
  if (existingOwner.exists) {
    return fail(OWNER_EMAIL_TAKEN_MESSAGE, 409, { code: "email_taken" });
  }

  // --- Duplicate venue / claim resolution -----------------------------------
  //
  // Resolved BEFORE anything is written, so the 409 branches cost nothing to
  // unwind.
  let claimTarget: VenueProximityRow | null = null;

  try {
    if (claimVenueId) {
      const { data, error } = await supabaseAdmin
        .from("venues")
        .select(VENUE_CLAIM_COLUMNS)
        .eq("id", claimVenueId)
        .maybeSingle<VenueProximityRow>();
      if (error) throw new Error(error.message);
      if (!data) return fail("That venue no longer exists. Set your pin again.", 400);

      // THE GATE ON THIS PATH. `claimVenueId` is attacker-controlled, so it is
      // never trusted as proof of anything — it only re-selects a venue the
      // proximity check would have offered anyway. Without this, any id in the
      // body would attach the poster to any venue in the product.
      //
      // That sentence used to be aspirational: this branch had its own,
      // SHORTER copy of the rule, missing the (0, 0) clause, so posting
      // `claimVenueId: "hc-cbz-live"` with a pin anywhere near the Gulf of
      // Guinea returned an ownership link to the Category Blitz global room.
      // It now calls the same predicate the scan does and cannot drift again.
      if (!isClaimableVenueRow(data, { latitude, longitude })) {
        return fail("That venue isn't at the location you picked. Set your pin again.", 400);
      }
      // Hidden, but not by this flow: an internal room or a venue an admin hid.
      // Refused OUTRIGHT rather than merely left unstamped — a stranger must
      // not hold a `venue_owner_venues` row to it at all. Ops still activates
      // these through ActivateVenueFlow.
      if (isAdminHiddenVenueRow(data)) {
        console.error("[OwnerSignup] claim-refused-not-self-serve", { venueId: data.id });
        return unavailableResponse(data);
      }
      if (await venueHasOwner(data.id)) {
        return duplicateResponse(data, true);
      }
      claimTarget = data;
    } else {
      const nearby = await findNearbyVenue(latitude, longitude);
      if (nearby) {
        // Same refusal on the discovery side, so the wizard never offers a
        // claim the POST above would then reject. The row is still found, not
        // skipped: creating a second venue at an address we already hold would
        // split one bar's leaderboard in two.
        if (isAdminHiddenVenueRow(nearby)) {
          console.error("[OwnerSignup] duplicate-not-self-serve", { venueId: nearby.id });
          return unavailableResponse(nearby);
        }
        return duplicateResponse(nearby, await venueHasOwner(nearby.id));
      }
    }
  } catch (error) {
    console.error("[OwnerSignup] duplicate-check-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail("Something went wrong. Please try again.", 500);
  }

  // --- Writes ---------------------------------------------------------------
  //
  // From here on every failure must undo what came before it, in reverse. There
  // is no transaction: `unwind` IS the rollback, and it is the reason each id is
  // captured in a mutable local the moment its row exists.
  let authUserId: string | null = null;
  let ownerId: string | null = null;
  let createdVenueId: string | null = null;

  const unwind = async () => {
    // Reverse order, and each step is independently guarded — a failed unwind
    // step must not prevent the ones after it, or a 500 leaves more debris than
    // it had to.
    if (createdVenueId) {
      const deleted = await supabaseAdmin!.from("venues").delete().eq("id", createdVenueId);
      if (deleted.error) {
        console.error("[OwnerSignup] unwind-venue-failed", {
          venueId: createdVenueId,
          message: deleted.error.message,
        });
      }
    }
    // venue_owners.auth_id cascades from auth.users, so deleting the auth user
    // would take this row too. It is deleted explicitly anyway: the unwind
    // should be legible on its own and must not silently stop working if that
    // FK is ever changed.
    if (ownerId) {
      const deleted = await supabaseAdmin!.from("venue_owners").delete().eq("id", ownerId);
      if (deleted.error) {
        console.error("[OwnerSignup] unwind-owner-failed", { ownerId, message: deleted.error.message });
      }
    }
    if (authUserId) {
      const deleted = await supabaseAdmin!.auth.admin.deleteUser(authUserId);
      if (deleted.error) {
        console.error("[OwnerSignup] unwind-auth-user-failed", {
          message: deleted.error.message,
        });
      }
    }
  };

  // 1. Auth user. `email_confirm: true` matches /api/owner/auth/register: a
  //    completed Stripe payment is the real gate on this flow (plan §0), not an
  //    email round trip before the partner has paid anything.
  const created = await supabaseAdmin.auth.admin.createUser({
    email: draft.email,
    password: draft.password,
    email_confirm: true,
  });

  if (created.error || !created.data?.user) {
    // ORPHANED AUTH USER (Phase 5a §1). Reaching this branch means the
    // `venue_owners`-by-email pre-check above found NOTHING and Supabase still
    // says the email is taken — so the route knows this auth user has no owner
    // profile, and "sign in instead" is provably wrong: /api/owner/auth/login
    // will answer 401 because it joins through `venue_owners.auth_id`. Both
    // doors are shut and there is no self-service way out, so this must point
    // at a human.
    //
    // The tempting fix — "no owner row, so adopt or reset this auth user" — is
    // an ACCOUNT-TAKEOVER VECTOR AGAINST PLAYERS and must never be built:
    // `auth.users` is shared with the player tables (`accounts`, `users` and
    // five more), see the standing prohibition in CLAUDE.md and
    // tests/lib.auth-users-fk-guard.test.ts.
    //
    // The `email_taken` code is KEPT: the client renders `error` verbatim as
    // the footer hint, so the new copy needs no client change. The log line is
    // structured and greppable so these are discoverable without waiting for a
    // complaint.
    if (created.error?.message?.toLowerCase().includes("already registered")) {
      console.error("[OwnerSignup] orphan-auth-user", { email: draft.email });
      return fail(
        "This email is already registered but isn't attached to a partner account yet. " +
          "Email partnerships@hightopchallenge.com and we'll finish setting it up.",
        409,
        { code: "email_taken" }
      );
    }
    console.error("[OwnerSignup] create-user-failed", { message: created.error?.message });
    return fail("We couldn't create your account. Please try again.", 500);
  }
  authUserId = created.data.user.id;

  // 2. Owner profile.
  const ownerRow = await supabaseAdmin
    .from("venue_owners")
    .insert({ auth_id: authUserId, email: draft.email, name: draft.name })
    .select("id")
    .single<{ id: string }>();

  if (ownerRow.error || !ownerRow.data) {
    console.error("[OwnerSignup] create-owner-failed", { message: ownerRow.error?.message });
    await unwind();
    return fail("We couldn't create your account. Please try again.", 500);
  }
  ownerId = ownerRow.data.id;

  // 3. The venue — created only when this is not a claim.
  let venueId = claimTarget?.id ?? "";
  if (!claimTarget) {
    try {
      const venue = await createAdminVenue({
        name: draft.venueName,
        street: draft.street,
        city: draft.city,
        state: draft.state,
        zipCode: draft.zipCode,
        // Never submitted: US-only, rendered as a locked line on the address
        // screen (plan §0). The constant is the source of the value on both
        // sides.
        country: DEFAULT_VENUE_COUNTRY,
        // Advisory only. The client clears placeId whenever the pin detaches
        // from the looked-up Place (GPS, map drag, manual entry), so the
        // coordinates are canonical and are never re-derived from it.
        placeId: draft.placeId,
        latitude,
        longitude,
        radius: draft.radius,
        // Invisible to every player until the Stripe webhook reveals it, and
        // stamped so Phase 6's sweep may reap it if payment never happens. A row
        // created without the stamp is one the sweep will never collect and the
        // webhook will never reveal — they must be set together, in the insert.
        hidden: true,
        selfServeCreatedAt: new Date().toISOString(),
      });
      createdVenueId = venue.id;
      venueId = venue.id;
    } catch (error) {
      console.error("[OwnerSignup] create-venue-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      await unwind();
      return fail("We couldn't create your venue. Please try again.", 500);
    }
  }

  // 4. Ownership link. On a claim this never flips `hidden`: a live venue must
  //    not be hidden by someone claiming it, and an admin-created one must never
  //    become sweepable (plan §4 Phase 5 step 3).
  const link = await supabaseAdmin
    .from("venue_owner_venues")
    .insert({ owner_id: ownerId, venue_id: venueId });

  if (link.error) {
    // A unique violation on this insert can only mean one thing: somebody else
    // claimed this venue between the `venueHasOwner` re-check above and this
    // insert. That is the race Phase 5a §3's `venue_owner_venues (venue_id)`
    // unique index exists to close — the DB is the only place it can be made
    // atomic — and this converts the violation into the 409 the client already
    // renders instead of a generic 500. It is INERT until that index ships
    // (there is no constraint to violate yet), and harmless afterwards.
    //
    // Gated on `claimTarget` because a freshly created venue cannot collide:
    // nobody else can hold a link to an id that did not exist a moment ago.
    const code = (link.error as { code?: string }).code;
    if (code === "23505" && claimTarget) {
      console.error("[OwnerSignup] link-claim-raced", { venueId });
      await unwind();
      return duplicateResponse(claimTarget, true);
    }
    console.error("[OwnerSignup] link-venue-failed", { venueId, message: link.error.message });
    await unwind();
    return fail("We couldn't link your venue to your account. Please try again.", 500);
  }

  // 4b. Claiming a HIDDEN venue restarts its unpaid clock.
  //
  // `self_serve_created_at` means "this hidden row has been sitting unpaid since
  // X", and Phase 6's sweep deletes hidden, unpaid rows older than 7 days. A
  // partner who claims somebody's abandoned signup from three weeks ago inherits
  // that stamp — so without this the sweep would delete their venue out from
  // under them while they are still on the Stripe Checkout page.
  //
  // Deliberately narrow and deliberately non-fatal:
  //   - Only when the venue is hidden AND this flow created it. `hidden` alone
  //     was the guard until Phase 1 of docs/self-serve-signup-review-fixes-plan.md;
  //     it let a claim stamp an admin-created hidden venue, and
  //     `self_serve_created_at` is a CAPABILITY GRANT, not a timestamp — writing
  //     it simultaneously arms `maybeRevealVenue` (publish that venue to every
  //     player) and `sweepAbandonedSignupVenues` (delete it in 7 days). Never
  //     stamp a row this flow did not create; guard on the stamp, never on
  //     `hidden`. Redundant with the `isAdminHiddenVenueRow` refusal above, and
  //     deliberately so: this is the guard that must be right on its own.
  //   - Only AFTER the link succeeded. If the link fails we unwind, and the row
  //     must keep its original stamp so it stays sweepable.
  //   - A failure here is logged, not returned: the account and the link exist
  //     and the partner must be allowed to go pay. The cost of the miss is one
  //     stale row, and only if they then abandon Checkout.
  if (claimTarget?.hidden && isSelfServeVenueRow(claimTarget)) {
    const stamped = await supabaseAdmin
      .from("venues")
      .update({ self_serve_created_at: new Date().toISOString() })
      .eq("id", venueId);
    if (stamped.error) {
      console.error("[OwnerSignup] claim-stamp-refresh-failed", { venueId, message: stamped.error.message });
    }
  }

  // 5. Sign them in. The client routes straight to /owner/billing/setup, which
  //    is behind requireOwnerAuth — without this cookie the partner would land
  //    on the login screen holding an account they just created.
  return NextResponse.json(
    { ok: true, venueId },
    { headers: { "Set-Cookie": createOwnerSessionCookie(ownerId), "Cache-Control": "no-store" } }
  );
}
