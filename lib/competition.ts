import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  ChallengeGameType,
  ChallengeInvite,
  ChallengeStatus,
  PrizeWin,
  PrizeWinStatus,
  WeeklyPrize,
} from "@/types";

type ChallengeInviteRow = {
  id: string;
  venue_id: string;
  game_type: ChallengeGameType;
  sender_user_id: string;
  receiver_user_id: string;
  challenge_title: string;
  challenge_details: string | null;
  status: ChallengeStatus;
  week_start: string;
  expires_at: string | null;
  created_at: string;
  responded_at: string | null;
};

type WeeklyPrizeRow = {
  id: string;
  venue_id: string;
  week_start: string;
  prize_title: string;
  prize_description: string | null;
  reward_points: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type PrizeWinRow = {
  id: string;
  venue_id: string;
  user_id: string;
  week_start: string;
  prize_title: string;
  prize_description: string | null;
  reward_points: number;
  status: PrizeWinStatus;
  awarded_at: string;
  claimed_at: string | null;
};

type UserNameRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

type ListChallengesParams = {
  userId: string;
  venueId?: string;
  includeResolved?: boolean;
  limit?: number;
};

type CreateChallengeParams = {
  senderUserId: string;
  venueId?: string;
  receiverUsername: string;
  gameType: ChallengeGameType;
  challengeTitle?: string;
  challengeDetails?: string;
  expiresAt?: string;
};

type RespondChallengeParams = {
  userId: string;
  challengeId: string;
  action: "accept" | "decline" | "cancel" | "complete";
};

type ListPrizeWinsParams = {
  userId: string;
  venueId?: string;
  limit?: number;
};

const DEFAULT_WEEKLY_PRIZE_TITLE = "Weekly Venue Champion Prize";
const DEFAULT_WEEKLY_PRIZE_DESCRIPTION =
  "Top the leaderboard by Sunday night to claim this week's venue champion reward.";

function isMissingCompetitionTablesError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) {
    return false;
  }
  const message = String(error.message ?? "").toLowerCase();
  if (!message) {
    return false;
  }
  const mentionsTargetTables =
    message.includes("challenge_invites") ||
    message.includes("weekly_prizes") ||
    message.includes("prize_wins");
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (mentionsTargetTables && (message.includes("schema cache") || message.includes("relation")))
  );
}

export function getCurrentWeekStartDate(now: Date = new Date()): string {
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utcMidnight.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - daysSinceMonday);
  return utcMidnight.toISOString().slice(0, 10);
}

function getGameTypeLabel(gameType: ChallengeGameType): string {
  if (gameType === "pickem") return "Hightop Pick 'Em";
  if (gameType === "fantasy") return "Hightop Fantasy";
  if (gameType === "trivia") return "Hightop Trivia";
  return "Hightop Sports Bingo";
}

function mapWeeklyPrizeRow(row: WeeklyPrizeRow): WeeklyPrize {
  return {
    id: row.id,
    venueId: row.venue_id,
    weekStart: row.week_start,
    prizeTitle: row.prize_title,
    prizeDescription: row.prize_description ?? undefined,
    rewardPoints: Math.max(0, Number(row.reward_points ?? 0)),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrizeWinRow(row: PrizeWinRow): PrizeWin {
  return {
    id: row.id,
    venueId: row.venue_id,
    userId: row.user_id,
    weekStart: row.week_start,
    prizeTitle: row.prize_title,
    prizeDescription: row.prize_description ?? undefined,
    rewardPoints: Math.max(0, Number(row.reward_points ?? 0)),
    status: row.status,
    awardedAt: row.awarded_at,
    claimedAt: row.claimed_at ?? undefined,
  };
}

function mapChallengeInviteRow(
  row: ChallengeInviteRow,
  usernamesByUserId: Map<string, string>
): ChallengeInvite {
  return {
    id: row.id,
    venueId: row.venue_id,
    gameType: row.game_type,
    senderUserId: row.sender_user_id,
    senderUsername: usernamesByUserId.get(row.sender_user_id) ?? "Player",
    receiverUserId: row.receiver_user_id,
    receiverUsername: usernamesByUserId.get(row.receiver_user_id) ?? "Player",
    challengeTitle: row.challenge_title,
    challengeDetails: row.challenge_details ?? undefined,
    status: row.status,
    weekStart: row.week_start,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? undefined,
  };
}

export async function getWeeklyPrizeForVenue(params: {
  venueId: string;
  weekStart?: string;
}): Promise<WeeklyPrize> {
  const venueId = String(params.venueId ?? "").trim();
  const weekStart = String(params.weekStart ?? "").trim() || getCurrentWeekStartDate();

  const fallback: WeeklyPrize = {
    id: `fallback:${venueId || "venue"}:${weekStart}`,
    venueId,
    weekStart,
    prizeTitle: DEFAULT_WEEKLY_PRIZE_TITLE,
    prizeDescription: DEFAULT_WEEKLY_PRIZE_DESCRIPTION,
    rewardPoints: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!venueId || !supabaseAdmin) {
    return fallback;
  }

  const { data, error } = await supabaseAdmin
    .from("weekly_prizes")
    .select("id, venue_id, week_start, prize_title, prize_description, reward_points, active, created_at, updated_at")
    .eq("venue_id", venueId)
    .eq("week_start", weekStart)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WeeklyPrizeRow>();

  if (error || !data) {
    if (isMissingCompetitionTablesError(error)) {
      return fallback;
    }
    return fallback;
  }

  return mapWeeklyPrizeRow(data);
}

export async function listUserPrizeWins(params: ListPrizeWinsParams): Promise<PrizeWin[]> {
  const userId = String(params.userId ?? "").trim();
  if (!userId || !supabaseAdmin) {
    return [];
  }

  const limit = Math.max(1, Math.min(200, Number(params.limit ?? 50)));
  let query = supabaseAdmin
    .from("prize_wins")
    .select("id, venue_id, user_id, week_start, prize_title, prize_description, reward_points, status, awarded_at, claimed_at")
    .eq("user_id", userId)
    .order("awarded_at", { ascending: false })
    .limit(limit);

  const venueId = String(params.venueId ?? "").trim();
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;
  if (error || !data) {
    if (isMissingCompetitionTablesError(error)) {
      return [];
    }
    throw new Error(error?.message ?? "Failed to load prize wins.");
  }

  return data.map((row) => mapPrizeWinRow(row as PrizeWinRow));
}

export async function claimPrizeWin(params: {
  userId: string;
  prizeWinId: string;
}): Promise<{ claimed: boolean; rewardPoints: number; prizeTitle: string }> {
  const userId = String(params.userId ?? "").trim();
  const prizeWinId = String(params.prizeWinId ?? "").trim();
  if (!userId || !prizeWinId) {
    throw new Error("userId and prizeWinId are required.");
  }
  if (!supabaseAdmin) {
    return { claimed: false, rewardPoints: 0, prizeTitle: "" };
  }

  const nowIso = new Date().toISOString();
  const { data: claimedPrize, error } = await supabaseAdmin
    .from("prize_wins")
    .update({ status: "claimed", claimed_at: nowIso })
    .eq("id", prizeWinId)
    .eq("user_id", userId)
    .eq("status", "awarded")
    .select("id, prize_title, reward_points")
    .maybeSingle<{ id: string; prize_title: string; reward_points: number }>();

  if (error) {
    if (isMissingCompetitionTablesError(error)) {
      return { claimed: false, rewardPoints: 0, prizeTitle: "" };
    }
    throw new Error(error.message ?? "Failed to claim prize.");
  }
  if (!claimedPrize) {
    return { claimed: false, rewardPoints: 0, prizeTitle: "" };
  }

  const rewardPoints = Math.max(0, Number(claimedPrize.reward_points ?? 0));
  if (rewardPoints > 0) {
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("points")
      .eq("id", userId)
      .maybeSingle<{ points: number }>();
    if (userError) {
      throw new Error(userError.message ?? "Failed to load user points.");
    }
    const currentPoints = Math.max(0, Number(user?.points ?? 0));
    const { error: updateUserError } = await supabaseAdmin
      .from("users")
      .update({ points: currentPoints + rewardPoints })
      .eq("id", userId);
    if (updateUserError) {
      throw new Error(updateUserError.message ?? "Failed to apply prize points.");
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "success",
      message: `Prize claimed: +${rewardPoints} points from "${claimedPrize.prize_title}".`,
    });
  }

  return {
    claimed: true,
    rewardPoints,
    prizeTitle: claimedPrize.prize_title,
  };
}

export async function listUserChallenges(params: ListChallengesParams): Promise<ChallengeInvite[]> {
  const userId = String(params.userId ?? "").trim();
  if (!userId || !supabaseAdmin) {
    return [];
  }

  const limit = Math.max(1, Math.min(300, Number(params.limit ?? 200)));
  let query = supabaseAdmin
    .from("challenge_invites")
    .select(
      "id, venue_id, game_type, sender_user_id, receiver_user_id, challenge_title, challenge_details, status, week_start, expires_at, created_at, responded_at"
    )
    .or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const venueId = String(params.venueId ?? "").trim();
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }
  if (!params.includeResolved) {
    query = query.eq("status", "pending");
  }

  const { data, error } = await query;
  if (error || !data) {
    if (isMissingCompetitionTablesError(error)) {
      return [];
    }
    throw new Error(error?.message ?? "Failed to load challenges.");
  }

  const rows = data as ChallengeInviteRow[];
  const userIds = Array.from(new Set(rows.flatMap((row) => [row.sender_user_id, row.receiver_user_id]).filter(Boolean)));
  let usernamesByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersData } = await supabaseAdmin
      .from("users")
      .select("id, username")
      .in("id", userIds)
      .limit(userIds.length);

    usernamesByUserId = new Map<string, string>(
      (usersData as Array<{ id: string; username: string }> | null | undefined)?.map((user) => [user.id, user.username]) ?? []
    );
  }

  return rows.map((row) => mapChallengeInviteRow(row, usernamesByUserId));
}

export async function createChallengeInvite(params: CreateChallengeParams): Promise<ChallengeInvite> {
  const senderUserId = String(params.senderUserId ?? "").trim();
  const receiverUsername = String(params.receiverUsername ?? "").trim();
  const gameType = params.gameType;
  const title = String(params.challengeTitle ?? "").trim() || `${getGameTypeLabel(gameType)} Challenge`;
  const details = String(params.challengeDetails ?? "").trim();
  const venueIdInput = String(params.venueId ?? "").trim();
  const weekStart = getCurrentWeekStartDate();
  const expiresAt = String(params.expiresAt ?? "").trim();

  if (!senderUserId || !receiverUsername || !gameType) {
    throw new Error("senderUserId, receiverUsername, and gameType are required.");
  }
  if (!supabaseAdmin) {
    throw new Error("Challenge service is unavailable.");
  }

  const { data: sender, error: senderError } = await supabaseAdmin
    .from("users")
    .select("id, username, venue_id, points")
    .eq("id", senderUserId)
    .maybeSingle<UserNameRow>();

  if (senderError || !sender) {
    throw new Error(senderError?.message ?? "Sender profile was not found.");
  }

  const venueId = venueIdInput || sender.venue_id;
  if (sender.venue_id !== venueId) {
    throw new Error("Sender venue must match challenge venue.");
  }

  const { data: receiver, error: receiverError } = await supabaseAdmin
    .from("users")
    .select("id, username, venue_id, points")
    .ilike("username", receiverUsername)
    .eq("venue_id", venueId)
    .limit(1)
    .maybeSingle<UserNameRow>();

  if (receiverError || !receiver) {
    throw new Error("Receiver username was not found at this venue.");
  }
  if (receiver.id === sender.id) {
    throw new Error("You cannot challenge yourself.");
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("challenge_invites")
    .insert({
      venue_id: venueId,
      game_type: gameType,
      sender_user_id: sender.id,
      receiver_user_id: receiver.id,
      challenge_title: title,
      challenge_details: details || null,
      status: "pending",
      week_start: weekStart,
      expires_at: expiresAt || null,
    })
    .select(
      "id, venue_id, game_type, sender_user_id, receiver_user_id, challenge_title, challenge_details, status, week_start, expires_at, created_at, responded_at"
    )
    .maybeSingle<ChallengeInviteRow>();

  if (insertError || !inserted) {
    if ((insertError as SupabaseLikeError | null)?.code === "23505") {
      throw new Error("A pending challenge for this game already exists with that user.");
    }
    if (isMissingCompetitionTablesError(insertError)) {
      throw new Error("Challenge tables are missing. Run the latest database migrations.");
    }
    throw new Error(insertError?.message ?? "Failed to create challenge.");
  }

  await supabaseAdmin.from("notifications").insert({
    user_id: receiver.id,
    type: "info",
    message: `${sender.username} challenged you to ${getGameTypeLabel(gameType)}. Open Pending Challenges to respond.`,
  });

  const usernamesByUserId = new Map<string, string>([
    [sender.id, sender.username],
    [receiver.id, receiver.username],
  ]);
  return mapChallengeInviteRow(inserted, usernamesByUserId);
}

export async function respondToChallengeInvite(params: RespondChallengeParams): Promise<ChallengeInvite> {
  const userId = String(params.userId ?? "").trim();
  const challengeId = String(params.challengeId ?? "").trim();
  const action = params.action;
  if (!userId || !challengeId || !action) {
    throw new Error("userId, challengeId, and action are required.");
  }
  if (!supabaseAdmin) {
    throw new Error("Challenge service is unavailable.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("challenge_invites")
    .select(
      "id, venue_id, game_type, sender_user_id, receiver_user_id, challenge_title, challenge_details, status, week_start, expires_at, created_at, responded_at"
    )
    .eq("id", challengeId)
    .maybeSingle<ChallengeInviteRow>();

  if (existingError || !existing) {
    throw new Error(existingError?.message ?? "Challenge not found.");
  }

  if (existing.status !== "pending" && action !== "complete") {
    throw new Error("This challenge is no longer pending.");
  }

  let nextStatus: ChallengeStatus = existing.status;
  if (action === "accept") {
    if (existing.receiver_user_id !== userId) {
      throw new Error("Only the challenged user can accept this challenge.");
    }
    nextStatus = "accepted";
  } else if (action === "decline") {
    if (existing.receiver_user_id !== userId) {
      throw new Error("Only the challenged user can decline this challenge.");
    }
    nextStatus = "declined";
  } else if (action === "cancel") {
    if (existing.sender_user_id !== userId) {
      throw new Error("Only the sender can cancel this challenge.");
    }
    nextStatus = "canceled";
  } else if (action === "complete") {
    if (existing.sender_user_id !== userId && existing.receiver_user_id !== userId) {
      throw new Error("Only involved users can complete this challenge.");
    }
    nextStatus = "completed";
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("challenge_invites")
    .update({
      status: nextStatus,
      responded_at: new Date().toISOString(),
    })
    .eq("id", challengeId)
    .select(
      "id, venue_id, game_type, sender_user_id, receiver_user_id, challenge_title, challenge_details, status, week_start, expires_at, created_at, responded_at"
    )
    .maybeSingle<ChallengeInviteRow>();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Failed to update challenge.");
  }

  const { data: usersData } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .in("id", [updated.sender_user_id, updated.receiver_user_id]);
  const usernamesByUserId = new Map<string, string>(
    (usersData as Array<{ id: string; username: string }> | null | undefined)?.map((user) => [user.id, user.username]) ?? []
  );

  const senderUsername = usernamesByUserId.get(updated.sender_user_id) ?? "Player";
  const receiverUsername = usernamesByUserId.get(updated.receiver_user_id) ?? "Player";

  if (action === "accept") {
    await supabaseAdmin.from("notifications").insert({
      user_id: updated.sender_user_id,
      type: "success",
      message: `${receiverUsername} accepted your ${getGameTypeLabel(updated.game_type)} challenge.`,
    });
  } else if (action === "decline") {
    await supabaseAdmin.from("notifications").insert({
      user_id: updated.sender_user_id,
      type: "warning",
      message: `${receiverUsername} declined your ${getGameTypeLabel(updated.game_type)} challenge.`,
    });
  } else if (action === "cancel") {
    await supabaseAdmin.from("notifications").insert({
      user_id: updated.receiver_user_id,
      type: "info",
      message: `${senderUsername} canceled a pending ${getGameTypeLabel(updated.game_type)} challenge.`,
    });
  } else if (action === "complete") {
    const targetUserId =
      updated.sender_user_id === userId ? updated.receiver_user_id : updated.sender_user_id;
    await supabaseAdmin.from("notifications").insert({
      user_id: targetUserId,
      type: "info",
      message: `${senderUsername} and ${receiverUsername} marked a ${getGameTypeLabel(updated.game_type)} challenge as completed.`,
    });
  }

  return mapChallengeInviteRow(updated, usernamesByUserId);
}
