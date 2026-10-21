-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) 10.5.2 (finding §22 R4): the sync's
-- game writer keeps a stored score when its row has none. Re-creates bracket_save_feed_games from
-- 20261021035254_bracket_admin_corrections.sql (never edited) with ONE change:
--   home_score = coalesce(v_g.home_score, g.home_score)   (same for away_score)
-- The merge (lib/brackets/games.ts mergeOne) only ever sets a score when the feed has one, so a feed
-- score still overwrites; only a stale run's null (a sync that read the final before an admin entered
-- its score) no longer clears it. Clearing a stored score isn't needed: an admin enters the right one.
-- Functions are not affected by the 2026-10-30 grant change; the revoke/grant lines stay as before.

create or replace function public.bracket_save_feed_games(p_tournament_id uuid, p_games jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g record;
  v_written integer := 0;
  v_n integer;
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    raise exception 'bracket_save_feed_games: games must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_games) > 100 then
    raise exception 'bracket_save_feed_games: at most 100 games' using errcode = '22023';
  end if;

  for v_g in
    select * from jsonb_to_recordset(p_games) as x(
      round smallint,
      location smallint,
      slot smallint,
      feed_game_id bigint,
      tip_at timestamptz,
      status_state text,
      status_detail text,
      home_team jsonb,
      away_team jsonb,
      home_score integer,
      away_score integer,
      winner_side text,
      result_source text,
      feeds_seat smallint,
      feeds_seat_set_by text,
      mismatch_note text,
      seen_winner_side text,
      seen_result_held boolean
    )
  loop
    -- A game the table doesn't have yet: insert it with only what the sync may decide.
    insert into bracket_games (
      tournament_id, round, location, slot, feed_game_id, tip_at, status_state, status_detail,
      home_team, away_team, home_score, away_score, winner_side, result_source,
      feeds_seat, feeds_seat_set_by, mismatch_note, updated_at
    )
    values (
      p_tournament_id, v_g.round, v_g.location, v_g.slot, v_g.feed_game_id, v_g.tip_at, v_g.status_state, v_g.status_detail,
      v_g.home_team, v_g.away_team, v_g.home_score, v_g.away_score,
      case when v_g.result_source = 'feed' then v_g.winner_side end,
      case when v_g.result_source = 'feed' and v_g.winner_side is not null then 'feed' end,
      case when v_g.feeds_seat_set_by = 'auto' then v_g.feeds_seat end,
      case when v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null then 'auto' end,
      v_g.mismatch_note, now()
    )
    on conflict (tournament_id, round, location) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_written := v_written + 1;
      continue;
    end if;

    update bracket_games g
    set feed_game_id = v_g.feed_game_id,
        tip_at = v_g.tip_at,
        status_state = v_g.status_state,
        status_detail = v_g.status_detail,
        -- 10.5.2: a run whose feed has no score never clears a stored one (an admin's final score).
        home_score = coalesce(v_g.home_score, g.home_score),
        away_score = coalesce(v_g.away_score, g.away_score),
        home_team = case when g.teams_set_by = 'admin' then g.home_team else v_g.home_team end,
        away_team = case when g.teams_set_by = 'admin' then g.away_team else v_g.away_team end,
        feeds_seat = case
          when g.feeds_seat_set_by is distinct from 'admin' and v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null
          then v_g.feeds_seat else g.feeds_seat end,
        feeds_seat_set_by = case
          when g.feeds_seat_set_by is distinct from 'admin' and v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null
          then 'auto' else g.feeds_seat_set_by end,
        winner_side = case
          when g.winner_side is null and not g.result_held and v_g.result_source = 'feed' and v_g.winner_side is not null
          then v_g.winner_side else g.winner_side end,
        result_source = case
          when g.winner_side is null and not g.result_held and v_g.result_source = 'feed' and v_g.winner_side is not null
          then 'feed' else g.result_source end,
        mismatch_note = case
          when g.winner_side is not distinct from v_g.seen_winner_side and g.result_held = coalesce(v_g.seen_result_held, false)
          then v_g.mismatch_note else g.mismatch_note end,
        updated_at = now()
    where g.tournament_id = p_tournament_id and g.round = v_g.round and g.location = v_g.location;
    get diagnostics v_n = row_count;
    v_written := v_written + v_n;
  end loop;
  return v_written;
end;
$$;

revoke all on function public.bracket_save_feed_games(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bracket_save_feed_games(uuid, jsonb) to service_role;
