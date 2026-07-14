"use client";

export type VenuePresenceClientCode =
  | "AUTH_REQUIRED"
  | "VENUE_PRESENCE_REQUIRED"
  | "VENUE_PRESENCE_EXPIRED"
  | "VENUE_OUT_OF_RANGE"
  | "VENUE_LOCATION_UNAVAILABLE"
  | "VENUE_PROFILE_MISMATCH"
  | "VENUE_PRESENCE_UNAVAILABLE";

export type VenuePresenceClientFailure = {
  code: VenuePresenceClientCode;
  userMessage: string;
  status?: string;
  distanceMeters?: number;
  allowedDistanceMeters?: number;
  accuracyMeters?: number;
};

export type VenueAccessOverlayKind =
  | "out_of_range"
  | "checking"
  | "location_off"
  | "rejoin_required"
  | "signed_out";

export type VenueAccessOverlayContent = {
  kind: VenueAccessOverlayKind;
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction: "recheck" | "home";
  secondaryLabel?: string;
  secondaryAction?: "home";
};

type VenuePresencePayload = {
  ok?: boolean;
  code?: unknown;
  error?: unknown;
  userMessage?: unknown;
  presence?: {
    status?: unknown;
    distanceMeters?: unknown;
    allowedDistanceMeters?: unknown;
    accuracyMeters?: unknown;
  } | null;
};

const VENUE_PRESENCE_CODES = new Set<VenuePresenceClientCode>([
  "AUTH_REQUIRED",
  "VENUE_PRESENCE_REQUIRED",
  "VENUE_PRESENCE_EXPIRED",
  "VENUE_OUT_OF_RANGE",
  "VENUE_LOCATION_UNAVAILABLE",
  "VENUE_PROFILE_MISMATCH",
  "VENUE_PRESENCE_UNAVAILABLE",
]);

function asRoundedNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

export function isVenuePresenceClientCode(value: unknown): value is VenuePresenceClientCode {
  return typeof value === "string" && VENUE_PRESENCE_CODES.has(value as VenuePresenceClientCode);
}

export function extractVenuePresenceFailure(payload: unknown): VenuePresenceClientFailure | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const parsed = payload as VenuePresencePayload;
  if (!isVenuePresenceClientCode(parsed.code)) {
    return null;
  }

  const fallbackMessage =
    parsed.code === "AUTH_REQUIRED"
      ? "Please sign in again to continue playing."
      : parsed.code === "VENUE_LOCATION_UNAVAILABLE"
      ? "We need to confirm you're still at the venue. Turn on location access and recheck to keep playing."
      : parsed.code === "VENUE_PROFILE_MISMATCH"
      ? "Please re-enter from the venue to continue playing."
      : parsed.code === "VENUE_PRESENCE_UNAVAILABLE"
      ? "We could not confirm venue access. Please recheck your location to keep playing."
      : parsed.code === "VENUE_OUT_OF_RANGE"
      ? "Your game access has been paused because you're no longer within range of this partner venue. Return to the venue to keep playing."
      : "Return to the venue to keep playing.";

  return {
    code: parsed.code,
    userMessage:
      typeof parsed.userMessage === "string" && parsed.userMessage.trim()
        ? parsed.userMessage
        : typeof parsed.error === "string" && parsed.error.trim()
        ? parsed.error
        : fallbackMessage,
    status: typeof parsed.presence?.status === "string" ? parsed.presence.status : undefined,
    distanceMeters: asRoundedNumber(parsed.presence?.distanceMeters),
    allowedDistanceMeters: asRoundedNumber(parsed.presence?.allowedDistanceMeters),
    accuracyMeters: asRoundedNumber(parsed.presence?.accuracyMeters),
  };
}

export function buildVenuePresenceFailure(
  code: VenuePresenceClientCode,
  overrides: Partial<Omit<VenuePresenceClientFailure, "code">> = {}
): VenuePresenceClientFailure {
  return {
    code,
    userMessage: overrides.userMessage ?? extractVenuePresenceFailure({ code })?.userMessage ?? "Venue access is unavailable.",
    status: overrides.status,
    distanceMeters: overrides.distanceMeters,
    allowedDistanceMeters: overrides.allowedDistanceMeters,
    accuracyMeters: overrides.accuracyMeters,
  };
}

export function mapVenuePresenceFailureToOverlay(
  failure: VenuePresenceClientFailure,
  options: { permissionDenied?: boolean } = {}
): VenueAccessOverlayContent {
  if (failure.code === "AUTH_REQUIRED") {
    return {
      kind: "signed_out",
      title: "Sign in to keep playing",
      body: "Your session needs attention before you can continue.",
      primaryLabel: "Back to Venue Home",
      primaryAction: "home",
    };
  }

  if (failure.code === "VENUE_LOCATION_UNAVAILABLE") {
    if (options.permissionDenied) {
      return {
        kind: "location_off",
        title: "Location access is off",
        body: "To keep playing, turn location access back on and recheck from inside the venue.",
        primaryLabel: "Recheck Location",
        primaryAction: "recheck",
      };
    }

    return {
      kind: "checking",
      title: "Checking your venue access",
      body: "We're having trouble confirming you're still at the venue. Stay nearby while we recheck your location.",
      primaryLabel: "Recheck Location",
      primaryAction: "recheck",
    };
  }

  if (failure.code === "VENUE_PROFILE_MISMATCH") {
    return {
      kind: "rejoin_required",
      title: "Venue access changed",
      body: "Your venue access has been paused. Return to the venue home and re-enter from inside the partner venue to keep playing.",
      primaryLabel: "Back to Venue Home",
      primaryAction: "home",
    };
  }

  if (failure.code === "VENUE_PRESENCE_UNAVAILABLE") {
    return {
      kind: "checking",
      title: "Checking your venue access",
      body: "We're having trouble confirming you're still at the venue. Stay nearby while we recheck your location.",
      primaryLabel: "Recheck Location",
      primaryAction: "recheck",
    };
  }

  return {
    kind: "out_of_range",
    title: "You've left the venue",
    body: "Your game access has been paused because you're no longer within range of this partner venue. Return to the venue to keep playing.",
    primaryLabel: "Recheck Location",
    primaryAction: "recheck",
    secondaryLabel: "Back to Venue Home",
    secondaryAction: "home",
  };
}

export function venuePresenceKindLabel(kind: VenueAccessOverlayKind): string {
  if (kind === "out_of_range") return "Venue Access Paused";
  if (kind === "checking") return "Checking Access";
  if (kind === "location_off") return "Location Needed";
  if (kind === "rejoin_required") return "Venue Re-entry";
  return "Session Check";
}
