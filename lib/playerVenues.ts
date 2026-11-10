import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { selectRecentVenues, type RecentVenue } from "@/lib/recentVenues";

// "Your bars" and opening a bar the player isn't at (docs/cancelled-prizes-pick-windows-away-mode-plan.md,
// D6 + Phase C1). Both start from the SIGNED session's users row (`tp_sess`), never an id from the browser:
// which bars a player visits is private, and an account id alone proves nothing.
//
// A player has one users row per bar (`users.account_id` + `users.venue_id`). Opening bar X switches the
// session to the account's EXISTING X row, the same identity joining at X gives, minus the location check.
// It never creates a row and records no presence, so every presence-checked write stays shut until a
// location check passes at X (VENUE_PRESENCE_ENFORCEMENT).

type SessionUserRow = {
  id: string;
  account_id: string | null;
  auth_id: string | null;
  username: string;
  venue_id: string;
  points: number | null;
  created_at: string | null;
};

const USER_COLUMNS = "id, account_id, auth_id, username, venue_id, points, created_at";

export type OpenedVenueProfile = {
  id: string;
  accountId?: string;
  authId?: string;
  username: string;
  venueId: string;
  points: number;
  createdAt?: string;
};

const readUser = async (userId: string): Promise<SessionUserRow | null> => {
  if (!supabaseAdmin || !userId) return null;
  const { data, error } = await supabaseAdmin.from("users").select(USER_COLUMNS).eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data as SessionUserRow;
};

/**
 * The session's player, only when the browser is signed in as the SAME player. A phone can still hold
 * player A's session while player B signs in (a sign-out that never reached us): B must never see or open
 * A's bars. The browser's player id (`tp:user-id`) can only narrow this check, never widen it. It is the
 * player id, not the account id, because opening a bar clears the browser's account id and re-saves only
 * the player id (JoinFlow `navigateToResolvedVenue`; Phase R's second review).
 */
const readSessionUser = async (
  sessionUserId: string,
  claimedUserId: string | null
): Promise<SessionUserRow | null> => {
  if ((claimedUserId ?? "").trim() !== sessionUserId) return null;
  return readUser(sessionUserId);
};

/**
 * The signed-in player's bars, newest check-in first: every bar checked in at in the last 90 days, plus
 * `requestedVenueId` when the account has a profile there. Three small reads. `null` = the read failed.
 */
export const listRecentVenuesForSession = async (
  sessionUserId: string,
  claimedUserId: string | null,
  requestedVenueId: string | null,
  nowMs: number = Date.now()
): Promise<RecentVenue[] | null> => {
  const admin = supabaseAdmin;
  if (!admin) return null;
  const user = await readSessionUser(sessionUserId, claimedUserId);
  if (!user) return [];

  let profiles: Array<{ id: string; venue_id: string }> = [{ id: user.id, venue_id: user.venue_id }];
  if (user.account_id) {
    const { data, error } = await admin.from("users").select("id, venue_id").eq("account_id", user.account_id);
    if (error) return null;
    profiles = (data ?? []) as Array<{ id: string; venue_id: string }>;
  }
  if (profiles.length === 0) return [];

  const { data: sessions, error: sessionError } = await admin
    .from("venue_presence_sessions")
    .select("user_id, venue_id, last_verified_at")
    .in(
      "user_id",
      profiles.map((profile) => profile.id)
    );
  if (sessionError) return null;

  // Only a check-in made AS that bar's profile counts: a God Mode lease can sit on another bar's row.
  const venueOfProfile = new Map(profiles.map((profile) => [profile.id, profile.venue_id] as const));
  const checkIns = ((sessions ?? []) as Array<{ user_id: string; venue_id: string; last_verified_at: string | null }>)
    .filter((row) => venueOfProfile.get(row.user_id) === row.venue_id)
    .map((row) => ({ venueId: row.venue_id, lastVerifiedAt: row.last_verified_at }));
  // A bar with a profile but no presence row yet can still be the requested one.
  const withoutCheckIn = profiles.map((profile) => ({ venueId: profile.venue_id, lastVerifiedAt: null }));

  return selectRecentVenues([...checkIns, ...withoutCheckIn], nowMs, requestedVenueId);
};

/**
 * The signed-in account's existing profile at `venueId`, or null (no such profile, a hidden or missing bar,
 * a legacy player with no account at another bar, a browser signed in as another player). Never creates one.
 */
export const openVenueProfileForSession = async (
  sessionUserId: string,
  claimedUserId: string | null,
  venueId: string
): Promise<OpenedVenueProfile | null> => {
  const admin = supabaseAdmin;
  if (!admin || !venueId) return null;
  const user = await readSessionUser(sessionUserId, claimedUserId);
  if (!user) return null;

  const { data: venue, error: venueError } = await admin
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .or("hidden.is.null,hidden.eq.false")
    .maybeSingle();
  if (venueError || !venue) return null;

  let profile: SessionUserRow | null = user.venue_id === venueId ? user : null;
  if (!profile && user.account_id) {
    const { data, error } = await admin
      .from("users")
      .select(USER_COLUMNS)
      .eq("account_id", user.account_id)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (error) return null;
    profile = (data as SessionUserRow | null) ?? null;
  }
  if (!profile) return null;

  return {
    id: profile.id,
    accountId: profile.account_id ?? undefined,
    authId: profile.auth_id ?? undefined,
    username: profile.username,
    venueId: profile.venue_id,
    points: Math.max(0, Math.round(Number(profile.points ?? 0))),
    createdAt: profile.created_at ?? undefined,
  };
};
