import "server-only";

import {
  attachLeaderboardSnapshotsToCampaigns,
  createChallengeCampaign,
  deleteChallengeCampaign,
  getChallengeCampaignOwnership,
  listChallengeCampaigns,
} from "@/lib/challengeCampaigns";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { getOwnerCompetitionTemplate } from "@/lib/ownerCompetitionTemplates";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import type { ChallengeCampaign, ChallengeGameType } from "@/types";

// ── Venue Competitions (Phase 9a) ──────────────────────────────────────────────
// Partners schedule competitions over the ASYNC games (Pick'em week races, Prop
// Bingo nights, Fantasy nights…) from the Partner Dashboard. This is a thin
// ownership + template boundary over the existing challenge_campaigns engine —
// NOT a new engine. Owners never send raw engine fields; they pick a template
// (the client-safe registry in lib/ownerCompetitionTemplates.ts) which is
// expanded into the full createChallengeCampaign input here, plus a window.
//
// Player visibility, scoring, winners, and prize redemption all flow through the
// unchanged engine (owner-created rows carry created_by_owner_id but are
// otherwise identical to admin-created ones).

export {
  OWNER_COMPETITION_TEMPLATES,
  getOwnerCompetitionTemplate,
  type OwnerCompetitionTemplate,
  type OwnerCompetitionTemplateId,
} from "@/lib/ownerCompetitionTemplates";

// ── Guardrails ─────────────────────────────────────────────────────────────────
export const OWNER_COMPETITION_CAP = 3;
const MIN_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000; // 31 days

// Sentinel messages the route layer maps to specific HTTP statuses.
export const OWNER_COMPETITION_UNKNOWN_TEMPLATE_MESSAGE = "Unknown competition type.";
export const OWNER_COMPETITION_WINDOW_MESSAGE =
  "A competition must run at least an hour and no more than 31 days.";
export const OWNER_COMPETITION_CAP_MESSAGE =
  "You already have the maximum of 3 competitions running at this venue. End one first.";
export const OWNER_COMPETITION_DUPLICATE_MESSAGE =
  "You already have that same competition scheduled for this window.";

/** Every venue in the set must be one the owner controls. */
export function ownsAllVenues(auth: OwnerAuthContext, venueIds: string[]): boolean {
  return venueIds.length > 0 && venueIds.every((id) => auth.venueIds.includes(id));
}

export type OwnerCompetitionPrize =
  | { type: "none" }
  | { type: "description"; description: string }
  | { type: "gift_certificate"; amount: number };

/**
 * Compose the player-facing rules text. A free-text prize is appended to the
 * rules (the engine's prizeType enum can't represent arbitrary prizes), while a
 * gift-certificate prize rides the engine's prizeType/amount fields.
 */
function composeRules(baseRules: string, prize: OwnerCompetitionPrize | undefined): string {
  if (prize?.type === "description" && prize.description.trim()) {
    return `${baseRules}\n\nPrize: ${prize.description.trim()}`;
  }
  return baseRules;
}

export type CreateOwnerCompetitionParams = {
  ownerId: string;
  venueId: string;
  templateId: string;
  /** Overrides the template's default name. */
  title?: string;
  startDate: string; // YYYY-MM-DD (venue local)
  startTime: string; // HH:MM
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:MM
  timezone: string;
  prize?: OwnerCompetitionPrize;
};

/** Parse a naive local date+time the same way the engine's one-time window does. */
function localWindowMs(date: string, time: string): number {
  return Date.parse(`${date}T${(time || "00:00")}:00`);
}

/**
 * Create a competition on an owner's behalf. Assumes venue ownership is already
 * verified by the route. Expands the chosen template into the full engine input
 * so the owner never touches raw engine fields (no pointMultiplier, no
 * displayOrder, no multi-venue arrays). Enforces the cap + window + duplicate
 * guardrails. Throws a sentinel message the route maps to 400/409.
 */
export async function createOwnerCompetition(
  params: CreateOwnerCompetitionParams,
): Promise<ChallengeCampaign> {
  const template = getOwnerCompetitionTemplate(params.templateId);
  if (!template) throw new Error(OWNER_COMPETITION_UNKNOWN_TEMPLATE_MESSAGE);

  const startMs = localWindowMs(params.startDate, params.startTime);
  const endMs = localWindowMs(params.endDate, params.endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(OWNER_COMPETITION_WINDOW_MESSAGE);
  }
  const durationMs = endMs - startMs;
  if (durationMs < MIN_WINDOW_MS || durationMs > MAX_WINDOW_MS) {
    throw new Error(OWNER_COMPETITION_WINDOW_MESSAGE);
  }
  // Validate the venue-local strings actually parse in the given timezone too
  // (surfaces a bad date/time early; the result is not stored — storage is naive).
  datetimeLocalValueToUtcIso(`${params.startDate}T${params.startTime}`, params.timezone);
  datetimeLocalValueToUtcIso(`${params.endDate}T${params.endTime}`, params.timezone);

  // Cap: at most OWNER_COMPETITION_CAP active (non-resolved) owner competitions
  // per venue. listChallengeCampaigns defaults to active + unresolved.
  const active = await listChallengeCampaigns({
    createdByOwnerId: params.ownerId,
    venueId: params.venueId,
  });
  if (active.length >= OWNER_COMPETITION_CAP) {
    throw new Error(OWNER_COMPETITION_CAP_MESSAGE);
  }

  // Duplicate: overlap is allowed in general (two leaderboards can run at once),
  // but reject an identical template + identical window (same game types + same
  // start/end) — the mark of an accidental double-submit.
  const sameGameTypes = (a: ChallengeGameType[], b: ChallengeGameType[]) =>
    a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
  const isDuplicate = active.some(
    (c) =>
      sameGameTypes(c.gameTypes, template.gameTypes) &&
      c.startDate === params.startDate &&
      c.startTime === params.startTime &&
      c.endDate === params.endDate &&
      c.endTime === params.endTime,
  );
  if (isDuplicate) throw new Error(OWNER_COMPETITION_DUPLICATE_MESSAGE);

  const usesGiftCertificate = params.prize?.type === "gift_certificate";

  return createChallengeCampaign({
    name: (params.title ?? "").trim() || template.name,
    rules: composeRules(template.rulesText, params.prize),
    // CRITICAL: non-empty venue_ids so the competition is scoped to this venue.
    // Empty venue_ids would make the engine treat it as a global (all-venue)
    // campaign — see campaignMatchesVenue in lib/challengeCampaigns.ts.
    venueIds: [params.venueId],
    scheduleType: "multi_day",
    recurringType: "none", // owner competitions are one-off
    startDate: params.startDate,
    startTime: params.startTime,
    endDate: params.endDate,
    endTime: params.endTime,
    gameTypes: template.gameTypes,
    challengeMode: template.challengeMode,
    pointsRequiredToWin: template.pointsRequiredToWin,
    prizeType: usesGiftCertificate ? "gift_certificate" : null,
    prizeGiftCertificateAmount: usesGiftCertificate
      ? (params.prize as { type: "gift_certificate"; amount: number }).amount
      : null,
    createdByOwnerId: params.ownerId,
  });
}

/**
 * List one owner's competitions for a venue (active, upcoming, and resolved),
 * each with a live leaderboard snapshot. progressPoints is 0 here — the owner
 * view shows the venue-wide leaderboard, not a personal player total.
 */
export async function listOwnerCompetitions(
  ownerId: string,
  venueId: string,
): Promise<Array<ChallengeCampaign & { progressPoints: number }>> {
  const campaigns = await listChallengeCampaigns({
    createdByOwnerId: ownerId,
    venueId,
    includeInactive: true,
    includeResolved: true,
  });
  if (campaigns.length === 0) return [];
  const withProgress = campaigns.map((c) => ({ ...c, progressPoints: 0 }));
  return attachLeaderboardSnapshotsToCampaigns({ campaigns: withProgress, venueId });
}

export type DeleteOwnerCompetitionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Delete an owner's competition. Resolves the campaign first: an unknown id is
 * not_found (404); a campaign the caller didn't create OR whose venue they don't
 * control is forbidden (403) — mirrors the Phase 4 DELETE boundary. Deleting
 * mid-cycle voids the cycle (no winner recorded) — the UI warns before calling.
 */
export async function deleteOwnerCompetition(
  id: string,
  auth: OwnerAuthContext,
): Promise<DeleteOwnerCompetitionResult> {
  const ownership = await getChallengeCampaignOwnership(id);
  if (!ownership) return { ok: false, reason: "not_found" };
  if (ownership.createdByOwnerId !== auth.ownerId) return { ok: false, reason: "forbidden" };
  if (!ownsAllVenues(auth, ownership.venueIds)) return { ok: false, reason: "forbidden" };
  await deleteChallengeCampaign(id);
  return { ok: true };
}
