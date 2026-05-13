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

  if (webhookId && supabaseAdmin) {
    const { error: dedupError } = await supabaseAdmin
      .from("webhook_events_processed")
      .insert({ webhook_id: webhookId });
    if (dedupError?.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const root = body as Record<string, unknown>;
  const eventType = String(root?.type ?? root?.event ?? root?.event_type ?? "");

  if (eventType.startsWith("nba.player.")) {
    const event = parseNbaPlayerEvent(body);
    if (!event) {
      return NextResponse.json({ ok: true, skipped: "unparseable" });
    }
    try {
      await handleNbaPlayerEvent(event);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[bdl-webhook] handleNbaPlayerEvent failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // If this webhook includes a final game status update, trigger Pick 'Em settlement immediately.
  const gameStatus = String(
    ((root?.data as Record<string, unknown> | undefined)?.game as Record<string, unknown> | undefined)?.status ??
      (root?.game as Record<string, unknown> | undefined)?.status ??
      root?.status ??
      ""
  )
    .trim()
    .toLowerCase();
  if (gameStatus === "final" || gameStatus === "status_final" || gameStatus === "ft" || gameStatus === "status_full_time") {
    try {
      await settlePendingPickEmPicks();
    } catch (err) {
      console.error("[bdl-webhook] settlePendingPickEmPicks failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleNbaPlayerEvent(event: BdlNbaPlayerEvent): Promise<void> {
  if (!supabaseAdmin) return;

  const totalFantasyPoints = calcNbaFantasyPoints(event.stats);

  const { error: upsertError } = await supabaseAdmin.from("live_player_stats").upsert(
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

  await resolveBingoSquares(event);
}

async function resolveBingoSquares(event: BdlNbaPlayerEvent): Promise<void> {
  if (!supabaseAdmin) return;

  const { data: cards, error: cardsError } = await supabaseAdmin
    .from("sports_bingo_cards")
    .select("id")
    .eq("game_id", event.gameId)
    .eq("status", "active");

  if (cardsError || !cards?.length) return;

  const cardIds = cards.map((c: Record<string, unknown>) => c.id);

  const { data: squares, error: squaresError } = await supabaseAdmin
    .from("sports_bingo_squares")
    .select("id, resolver")
    .in("card_id", cardIds)
    .eq("status", "pending");

  if (squaresError || !squares?.length) return;

  const hitIds: string[] = [];

  for (const square of squares as Array<{ id: string; resolver: Record<string, unknown> }>) {
    const resolver = square.resolver;
    if (resolver.kind !== "nba_player_stat_at_least") continue;

    const resolverPlayer = String(resolver.player ?? "");
    if (!resolverPlayer) continue;
    if (normalizePlayerName(resolverPlayer) !== event.normalizedPlayerName) continue;

    const metric = String(resolver.metric ?? "");
    const threshold = Number(resolver.threshold ?? 0);
    if (!metric || threshold <= 0) continue;

    if (getStatForBingoMetric(event.stats, metric) >= threshold) {
      hitIds.push(square.id);
    }
  }

  if (hitIds.length === 0) return;

  await supabaseAdmin
    .from("sports_bingo_squares")
    .update({ status: "hit", resolved_at: new Date().toISOString() })
    .in("id", hitIds)
    .eq("status", "pending");
}
