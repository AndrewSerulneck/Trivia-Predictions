import { NextResponse } from "next/server";
import {
  verifyBdlSignature,
  parseNbaPlayerEvent,
  calcNbaFantasyPoints,
  normalizePlayerName,
  getStatForBingoMetric,
  type BdlNbaPlayerEvent,
} from "@/lib/webhooks/balldontlie";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { settlePendingPickEmPicks } from "@/lib/pickem";
import { refreshFantasyProgress } from "@/lib/fantasy";
import { refreshSportsBingoProgress } from "@/lib/sportsBingo";

const WEBHOOK_SECRET = process.env.BALLDONTLIE_WEBHOOK_SECRET?.trim() ?? "";

export async function POST(request: Request) {
  const rawBody = await request.text();

  const timestamp = request.headers.get("x-bdl-webhook-timestamp") ?? "";
  const signature = request.headers.get("x-bdl-webhook-signature") ?? "";
  const webhookId = request.headers.get("x-bdl-webhook-id") ?? "";

  if (WEBHOOK_SECRET && !verifyBdlSignature(WEBHOOK_SECRET, timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  if (webhookId) {
    const { error: dedupError } = await supabaseAdmin
      .from("webhook_events_processed")
      .insert({ webhook_id: webhookId });
    if (dedupError?.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (dedupError) {
      console.error("[bdl-webhook] dedup insert failed:", dedupError.message);
    }
  }

  const root = body as Record<string, unknown>;
  const eventType = String(root?.type ?? root?.event ?? root?.event_type ?? "");
  const result: Record<string, unknown> = { ok: true, eventType };

  // BDL uses both "nba.player.*" and "nba.player_stat.*" — match the "nba.player" prefix
  // without the trailing dot so both variants are caught.
  if (eventType.startsWith("nba.player")) {
    const event = parseNbaPlayerEvent(body);
    if (!event) {
      return NextResponse.json({ ok: true, skipped: "unparseable_player_event", eventType });
    }
    try {
      const playerResult = await handleNbaPlayerEvent(event);
      result.playerEvent = { playerId: event.playerId, playerName: event.playerName, ...playerResult };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[bdl-webhook] handleNbaPlayerEvent failed:", msg);
      return NextResponse.json({ error: msg, eventType }, { status: 500 });
    }
  }

  // Detect game-final status from any event shape BDL might send.
  const gameStatus = String(
    ((root?.data as Record<string, unknown> | undefined)?.game as Record<string, unknown> | undefined)?.status ??
      (root?.game as Record<string, unknown> | undefined)?.status ??
      ((root?.data as Record<string, unknown> | undefined)?.game as Record<string, unknown> | undefined)?.game_state ??
      (root?.game as Record<string, unknown> | undefined)?.game_state ??
      root?.status ??
      ""
  )
    .trim()
    .toLowerCase();

  // BDL event types follow the pattern "<sport>.game.<action>" across all leagues.
  const isGameFinalEventType =
    eventType.endsWith(".game.end") ||
    eventType.endsWith(".game.final") ||
    eventType.endsWith(".game.complete");

  const isGameFinal =
    isGameFinalEventType ||
    gameStatus === "final" ||
    gameStatus === "post" ||
    gameStatus === "off" ||
    gameStatus === "completed" ||
    gameStatus === "status_final" ||
    gameStatus === "ft" ||
    gameStatus === "status_full_time";

  if (isGameFinal) {
    const [pickEmResult, fantasyResult, bingoResult] = await Promise.allSettled([
      settlePendingPickEmPicks(),
      refreshFantasyProgress({ limit: 500 }),
      refreshSportsBingoProgress({ limit: 500 }),
    ]);

    if (pickEmResult.status === "rejected") {
      const msg = pickEmResult.reason instanceof Error ? pickEmResult.reason.message : String(pickEmResult.reason);
      console.error("[bdl-webhook] settlePendingPickEmPicks failed:", msg);
      result.pickEmError = msg;
    } else {
      result.pickEm = pickEmResult.value;
    }

    if (fantasyResult.status === "rejected") {
      const msg = fantasyResult.reason instanceof Error ? fantasyResult.reason.message : String(fantasyResult.reason);
      console.error("[bdl-webhook] refreshFantasyProgress failed:", msg);
      result.fantasyError = msg;
    } else {
      result.fantasy = fantasyResult.value;
    }

    if (bingoResult.status === "rejected") {
      const msg = bingoResult.reason instanceof Error ? bingoResult.reason.message : String(bingoResult.reason);
      console.error("[bdl-webhook] refreshSportsBingoProgress failed:", msg);
      result.bingoError = msg;
    } else {
      result.bingo = bingoResult.value;
    }
  }

  return NextResponse.json(result);
}

async function handleNbaPlayerEvent(
  event: BdlNbaPlayerEvent
): Promise<{ statsUpserted: boolean; hit: number; miss: number }> {
  const totalFantasyPoints = calcNbaFantasyPoints(event.stats);

  const { error: upsertError } = await supabaseAdmin!.from("live_player_stats").upsert(
    {
      game_id: event.gameId,
      player_id: event.playerId,
      player_name: event.playerName,
      normalized_player_name: event.normalizedPlayerName,
      team_id: event.teamId,
      team_name: event.teamName,
      league_id: null,
      league_name: "NBA",
      game_status: event.gameStatus,
      pts: event.stats.pts,
      reb: event.stats.reb,
      ast: event.stats.ast,
      stl: event.stats.stl,
      blk: event.stats.blk,
      turnovers: event.stats.tov,
      total_fantasy_points: totalFantasyPoints,
      source_updated_at: new Date().toISOString(),
      sport_key: "basketball_nba",
      stat_type: "fantasy_points_total",
      value: totalFantasyPoints,
    },
    { onConflict: "game_id,player_id" }
  );

  if (upsertError) {
    throw new Error(`live_player_stats upsert failed: ${upsertError.message}`);
  }

  const { hit, miss } = await resolveBingoSquares(event);
  return { statsUpserted: true, hit, miss };
}

function isGameCompleted(gameStatus: string): boolean {
  const s = gameStatus.trim().toLowerCase();
  return s === "final" || s === "ft" || s.startsWith("final") || s === "status_final" || s === "status_full_time";
}

async function resolveBingoSquares(event: BdlNbaPlayerEvent): Promise<{ hit: number; miss: number }> {
  const { data: cards, error: cardsError } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("id")
    .eq("game_id", event.gameId)
    .eq("status", "active");

  if (cardsError) {
    console.error("[bdl-webhook] bingo cards query failed:", cardsError.message);
    return { hit: 0, miss: 0 };
  }
  if (!cards?.length) return { hit: 0, miss: 0 };

  const cardIds = cards.map((c: Record<string, unknown>) => c.id);

  const { data: squares, error: squaresError } = await supabaseAdmin!
    .from("sports_bingo_squares")
    .select("id, resolver")
    .in("card_id", cardIds)
    .eq("status", "pending");

  if (squaresError) {
    console.error("[bdl-webhook] bingo squares query failed:", squaresError.message);
    return { hit: 0, miss: 0 };
  }
  if (!squares?.length) return { hit: 0, miss: 0 };

  const hitIds: string[] = [];
  const missIds: string[] = [];
  const gameCompleted = isGameCompleted(event.gameStatus);
  const now = new Date().toISOString();

  for (const square of squares as Array<{ id: string; resolver: Record<string, unknown> }>) {
    const resolver = square.resolver;
    if (resolver.kind !== "nba_player_stat_at_least") continue;

    const resolverPlayer = String(resolver.player ?? "");
    if (!resolverPlayer) continue;
    if (normalizePlayerName(resolverPlayer) !== event.normalizedPlayerName) continue;

    const metric = String(resolver.metric ?? "");
    const threshold = Number(resolver.threshold ?? 0);
    if (!metric || threshold <= 0) continue;

    const value = getStatForBingoMetric(event.stats, metric);

    if (value >= threshold) {
      hitIds.push(square.id);
    } else if (gameCompleted) {
      // Game is over and the player fell short — square is a confirmed miss.
      missIds.push(square.id);
    }
    // If game is still live and threshold not yet reached, leave pending.
  }

  const resolvedAt = now;
  const updates: PromiseLike<unknown>[] = [];

  if (hitIds.length > 0) {
    updates.push(
      supabaseAdmin!
        .from("sports_bingo_squares")
        .update({ status: "hit", resolved_at: resolvedAt })
        .in("id", hitIds)
        .eq("status", "pending")
        .then(({ error }) => {
          if (error) console.error("[bdl-webhook] bingo hit update failed:", error.message);
        })
    );
  }

  if (missIds.length > 0) {
    updates.push(
      supabaseAdmin!
        .from("sports_bingo_squares")
        .update({ status: "miss", resolved_at: resolvedAt })
        .in("id", missIds)
        .eq("status", "pending")
        .then(({ error }) => {
          if (error) console.error("[bdl-webhook] bingo miss update failed:", error.message);
        })
    );
  }

  await Promise.all(updates);
  return { hit: hitIds.length, miss: missIds.length };
}
