export type LiveTriviaVenueSource = "route" | "storage" | "none";

export function resolveLiveTriviaVenueContext(params: {
  routeVenueId?: string | null;
  storedVenueId?: string | null;
}): { venueId: string; source: LiveTriviaVenueSource } {
  const routeVenueId = String(params.routeVenueId ?? "").trim();
  const storedVenueId = String(params.storedVenueId ?? "").trim();
  if (routeVenueId) {
    return { venueId: routeVenueId, source: "route" };
  }
  if (storedVenueId) {
    return { venueId: storedVenueId, source: "storage" };
  }
  return { venueId: "", source: "none" };
}

type LiveTriviaStatePayload = {
  ok?: boolean;
  state?: {
    isGameActive?: boolean;
    nextSchedule?: { startTime?: string; timezone?: string } | null;
  } | null;
} | null;

export type LiveTriviaPayloadFailureReason =
  | "non_ok_payload"
  | "missing_state"
  | "missing_next_start"
  | "invalid_next_start";

export type LiveTriviaPayloadEvaluation =
  | {
      kind: "live";
      label: "Live Now";
      nextStartAtMs: null;
      failureReason: null;
      scheduleTimezone: string;
      nextStartRaw: string;
    }
  | {
      kind: "upcoming";
      label: "upcoming";
      nextStartAtMs: number;
      failureReason: null;
      scheduleTimezone: string;
      nextStartRaw: string;
    }
  | {
      kind: "tbd";
      label: "Next Game: TBD";
      nextStartAtMs: null;
      failureReason: "missing_next_start";
      scheduleTimezone: string;
      nextStartRaw: "";
    }
  | {
      kind: "unavailable";
      label: "Status unavailable";
      nextStartAtMs: null;
      failureReason: Exclude<LiveTriviaPayloadFailureReason, "missing_next_start">;
      scheduleTimezone: string;
      nextStartRaw: string;
    };

export function evaluateLiveTriviaStatePayload(payload: LiveTriviaStatePayload): LiveTriviaPayloadEvaluation {
  if (!payload?.ok) {
    return {
      kind: "unavailable",
      label: "Status unavailable",
      nextStartAtMs: null,
      failureReason: "non_ok_payload",
      scheduleTimezone: "",
      nextStartRaw: "",
    };
  }

  const state = payload.state;
  if (!state) {
    return {
      kind: "unavailable",
      label: "Status unavailable",
      nextStartAtMs: null,
      failureReason: "missing_state",
      scheduleTimezone: "",
      nextStartRaw: "",
    };
  }

  const scheduleTimezone = String(state.nextSchedule?.timezone ?? "").trim();
  if (state.isGameActive) {
    return {
      kind: "live",
      label: "Live Now",
      nextStartAtMs: null,
      failureReason: null,
      scheduleTimezone,
      nextStartRaw: "",
    };
  }

  const nextStartRaw = String(state.nextSchedule?.startTime ?? "").trim();
  if (!nextStartRaw) {
    return {
      kind: "tbd",
      label: "Next Game: TBD",
      nextStartAtMs: null,
      failureReason: "missing_next_start",
      scheduleTimezone,
      nextStartRaw: "",
    };
  }

  const nextStartAtMs = Date.parse(nextStartRaw);
  if (!Number.isFinite(nextStartAtMs)) {
    return {
      kind: "unavailable",
      label: "Status unavailable",
      nextStartAtMs: null,
      failureReason: "invalid_next_start",
      scheduleTimezone,
      nextStartRaw,
    };
  }

  return {
    kind: "upcoming",
    label: "upcoming",
    nextStartAtMs,
    failureReason: null,
    scheduleTimezone,
    nextStartRaw,
  };
}
