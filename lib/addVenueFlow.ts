import { ADD_VENUE_MESSAGES, type AddVenueFailureCode, type AddVenueQuote } from "@/lib/multiVenueBilling";
import { BLANK_SIGNUP_DRAFT, signupStepIssue, type SignupDraft } from "@/lib/selfServeSignup";

// The partner-facing half of "Add a venue" (docs/multi-venue-volume-billing-plan.md §4.5, Phase 4):
// the sheet's steps, what each step needs before the partner may move on, the request body, and how
// the server's answer is turned into something the screen can show. Pure — no React, no fetch — so
// every rule here is unit-tested. The money and the add itself live in lib/venueAddition.ts; this
// file never decides a price or whether a venue was added, it only reads the answer.

/**
 * The sheet's screens, in order. The venue NAME is asked on `address` (the signup wizard's address
 * step carries it), so there is no separate name screen. Review & pay is the last.
 */
export const ADD_VENUE_STEPS = ["address", "map", "review"] as const;

export type AddVenueStep = (typeof ADD_VENUE_STEPS)[number];

/** The `?step=` for `step`. The first screen has none, like the store's Shop. */
export const addVenueUrlStep = (step: AddVenueStep): string | null => (step === "address" ? null : step);

/**
 * The venue answers the sheet collects, held as the signup wizard's draft shape so the signup
 * address and map-area steps can be reused as they are. `name`, `email` and `password` stay blank:
 * the partner already has an account.
 */
export type AddVenueDraft = SignupDraft;

export const blankAddVenueDraft = (): AddVenueDraft => ({ ...BLANK_SIGNUP_DRAFT });

/** True once the partner has typed or picked anything — the "Discard this venue?" test. */
export const addVenueDraftHasAnswers = (draft: AddVenueDraft): boolean =>
  Boolean(draft.venueName.trim() || draft.street.trim() || draft.city.trim() || draft.latitude !== null);

/** What is stopping `step` from being left, in words a bar owner can act on — or null. Same rules as signup. */
export const addVenueStepIssue = (step: AddVenueStep, draft: AddVenueDraft): string | null => {
  if (step === "address") return signupStepIssue("address", draft);
  if (step === "map") return signupStepIssue("address", draft) ?? signupStepIssue("geofence", draft);
  return addVenueStepIssue("map", draft);
};

/**
 * The screen to show for the raw `?step=`. A reload loses the draft (it lives in memory only), so a
 * step whose earlier answers are gone falls back to the screen that is missing them; anything
 * unknown is the first screen. `reviewReady` = the quote is in hand (Review shows nothing without it).
 */
export const resolveAddVenueStep = (rawStep: string | null, draft: AddVenueDraft): AddVenueStep => {
  if (rawStep !== "map" && rawStep !== "review") return "address";
  if (signupStepIssue("address", draft)) return "address";
  if (rawStep === "review" && signupStepIssue("geofence", draft)) return "map";
  return rawStep;
};

/** The POST body. Everything is the partner's answers except the three server-checked extras. */
export const buildAddVenueBody = (input: {
  draft: AddVenueDraft;
  idempotencyKey: string;
  venueId: string;
  prorationDate: number | null;
}): Record<string, unknown> => ({
  idempotencyKey: input.idempotencyKey,
  venueId: input.venueId,
  venueName: input.draft.venueName.trim(),
  street: input.draft.street.trim(),
  city: input.draft.city.trim(),
  state: input.draft.state.trim().toUpperCase(),
  zipCode: input.draft.zipCode.trim(),
  placeId: input.draft.placeId,
  latitude: input.draft.latitude,
  longitude: input.draft.longitude,
  radius: input.draft.radius,
  ...(input.prorationDate !== null ? { prorationDate: input.prorationDate } : {}),
});

// --- Reading the server's answers -----------------------------------------------------------------

/** Where a refusal sends the partner to fix it. */
export type AddVenueRefusalLink = "billing" | null;

/** What the Review screen does with one answer from `POST /api/owner/venues/add`. */
export type AddVenueOutcome =
  /** Paid and live. The sheet closes, the dashboard switches to `venueId`. */
  | { kind: "paid"; venueId: string | null; chargedTodayCents: number | null }
  /** The bank wants 3-D Secure on Stripe's page. The venue goes live when it is paid. Same key to re-check. */
  | { kind: "requires_action"; hostedInvoiceUrl: string | null }
  /** Payment is being confirmed. Ask again with the SAME key shortly. */
  | { kind: "processing" }
  /** We couldn't confirm the payment. Do NOT start a new add — ask again with the SAME key later. */
  | { kind: "unconfirmed"; message: string }
  /** Nothing was added. A new Confirm gets a NEW key. */
  | {
      kind: "refused";
      code: AddVenueFailureCode | "unknown";
      message: string;
      link: AddVenueRefusalLink;
      /** An earlier add still awaiting payment, when that is what blocked this one. */
      hostedInvoiceUrl: string | null;
    };

/** Refusals that are fixed in Billing (card, subscription state) rather than by retyping anything. */
const BILLING_FIX_CODES: readonly AddVenueFailureCode[] = ["card_declined", "bill_not_active", "cancel_scheduled", "no_bill"];

const isFailureCode = (value: unknown): value is AddVenueFailureCode =>
  typeof value === "string" && value in ADD_VENUE_MESSAGES;

const UNKNOWN_FAILURE = "We couldn't add that venue. Please try again.";

type AddVenueReplyBody = {
  ok?: unknown;
  status?: unknown;
  code?: unknown;
  error?: unknown;
  venueId?: unknown;
  chargedTodayCents?: unknown;
  hostedInvoiceUrl?: unknown;
};

const stringOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Only ever open Stripe's own hosted page, never a URL the answer happens to carry. */
export const isStripeHostedUrl = (value: string | null): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
};

/**
 * One answer → one outcome. `httpStatus` is the response status; `body` the parsed JSON (or null when it
 * wasn't JSON — a gateway error page — which reads as an unconfirmed payment on a 5xx and a refusal otherwise).
 */
export const interpretAddVenueReply = (httpStatus: number, body: unknown): AddVenueOutcome => {
  const reply: AddVenueReplyBody = body && typeof body === "object" ? (body as AddVenueReplyBody) : {};

  if (reply.ok === true) {
    if (reply.status === "paid") {
      return { kind: "paid", venueId: stringOrNull(reply.venueId), chargedTodayCents: numberOrNull(reply.chargedTodayCents) };
    }
    if (reply.status === "requires_action") {
      const url = stringOrNull(reply.hostedInvoiceUrl);
      return { kind: "requires_action", hostedInvoiceUrl: isStripeHostedUrl(url) ? url : null };
    }
    if (reply.status === "processing") return { kind: "processing" };
  }

  const code: AddVenueFailureCode | "unknown" = isFailureCode(reply.code) ? reply.code : "unknown";
  const message = stringOrNull(reply.error) ?? (code === "unknown" ? UNKNOWN_FAILURE : ADD_VENUE_MESSAGES[code]);

  // The server could not tell us whether the card was charged: never invite a second attempt.
  if (code === "payment_unconfirmed" || (code === "unknown" && httpStatus >= 500 && body === null)) {
    return { kind: "unconfirmed", message: code === "unknown" ? ADD_VENUE_MESSAGES.payment_unconfirmed : message };
  }

  const hostedInvoiceUrl = stringOrNull(reply.hostedInvoiceUrl);
  return {
    kind: "refused",
    code,
    message,
    link: code !== "unknown" && BILLING_FIX_CODES.includes(code) ? "billing" : null,
    hostedInvoiceUrl: isStripeHostedUrl(hostedInvoiceUrl) ? hostedInvoiceUrl : null,
  };
};

/** Quote answers use the same refusal shape; this reads `{ ok: true, quote }` or the refusal. */
export type AddVenueQuoteResult =
  | { ok: true; quote: AddVenueQuote }
  | { ok: false; code: AddVenueFailureCode | "unknown"; message: string; link: AddVenueRefusalLink; hostedInvoiceUrl: string | null };

const isQuote = (value: unknown): value is AddVenueQuote => {
  if (!value || typeof value !== "object") return false;
  const quote = value as Record<string, unknown>;
  return (
    typeof quote.venueNumber === "number" &&
    typeof quote.thisVenueCents === "number" &&
    typeof quote.newMonthlyTotalCents === "number" &&
    typeof quote.dueTodayCents === "number" &&
    typeof quote.prorationDate === "number"
  );
};

export const interpretQuoteReply = (httpStatus: number, body: unknown): AddVenueQuoteResult => {
  const reply = body && typeof body === "object" ? (body as { ok?: unknown; quote?: unknown }) : {};
  if (reply.ok === true && isQuote(reply.quote)) return { ok: true, quote: reply.quote };
  const refused = interpretAddVenueReply(httpStatus, body);
  // A code we don't recognise (or none) is the server not giving a reason — billing is unavailable, not a decision about the partner.
  if (refused.kind === "refused" && refused.code !== "unknown") {
    return { ok: false, code: refused.code, message: refused.message, link: refused.link, hostedInvoiceUrl: refused.hostedInvoiceUrl };
  }
  // A 5xx with no body, or an answer we don't recognise: billing is unavailable, not a decision about the partner.
  return { ok: false, code: "stripe_unavailable", message: ADD_VENUE_MESSAGES.stripe_unavailable, link: null, hostedInvoiceUrl: null };
};

/** "Through Oct 20" for the rest-of-the-month line, or null when the period end is unknown. */
export const formatPeriodEnd = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * A fresh idempotency key for one Confirm press (8–64 of `A-Za-z0-9_-`, what the server accepts). Made once
 * per attempt and re-sent on every re-ask of that attempt. A random UUID where the browser has one.
 */
export const newAttemptKey = (): string => {
  const webCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (webCrypto) webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
