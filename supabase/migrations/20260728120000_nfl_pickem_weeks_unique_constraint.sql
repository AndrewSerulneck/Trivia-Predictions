-- NFL Pick 'Em — restore the missing (season, week_number) unique constraint.
--
-- 20260715000000_add_nfl_pickem_weeks.sql declares
-- `CONSTRAINT nfl_pickem_weeks_season_week_unique UNIQUE (season, week_number)`
-- as part of `CREATE TABLE IF NOT EXISTS nfl_pickem_weeks (...)`. In production
-- the table already existed (from an earlier ad-hoc creation) by the time that
-- migration ran, so `IF NOT EXISTS` skipped the whole CREATE TABLE body —
-- constraint included. The result: syncNFLWeeks' upsert
-- (`onConflict: "season,week_number"`) has always failed with Postgres error
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"), silently, because the sync only logs per-row errors via
-- console.error and reports 0 weeks synced. This is the actual reason
-- nfl_pickem_weeks has been empty. See
-- docs/nfl-pickem-week1-early-access-plan.md.
--
-- The table is empty in production, so this is a pure additive fix with
-- nothing to conflict with.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'nfl_pickem_weeks_season_week_unique'
  ) then
    alter table nfl_pickem_weeks
      add constraint nfl_pickem_weeks_season_week_unique unique (season, week_number);
  end if;
end $$;
