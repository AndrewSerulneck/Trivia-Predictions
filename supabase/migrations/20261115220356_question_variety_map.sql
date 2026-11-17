-- Variety map, question tags, Current Events visibility and expiry
-- (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a; D11, D14, D15, D16).
--
-- * question_coverage_areas: the map. Per game and category, well-known areas and the eras each applies to.
-- * question_tags: one tag per question (area, era, subject). Speed refs are trivia_questions ids; Live refs are
--   the canonical JSON slugs (Live JSON is never written here or anywhere by this migration).
-- * speed_trivia_category_flags: one small row per gated Speed category. The nightly refreshes it; the player picker
--   reads it with what it already loads, so there is no count query per player.
-- * Dated expiry: Current Events rows carry speed_generation_metadata.expiresOn (D16). The monthly step retires
--   active and waiting rows past that date with the existing status-only retirement (allowed without a permit) and
--   logs the before-state in the same transaction. No question content changes; no trivia_questions column changes.
-- Lock order matches the admission RPCs: the control row first, then question rows.

create table public.question_coverage_areas (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('speed', 'live')),
  category text not null check (length(category) between 1 and 80),
  name text not null check (length(name) between 1 and 80),
  eras text[] not null check (cardinality(eras) between 1 and 20),
  note text check (note is null or length(note) <= 200),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by text check (created_by is null or length(created_by) <= 120),
  unique (id, game, category)
);
create unique index question_coverage_areas_name on public.question_coverage_areas (game, category, lower(name));
alter table public.question_coverage_areas enable row level security;
alter table public.question_coverage_areas force row level security;
revoke all on table public.question_coverage_areas from public, anon, authenticated;
-- Server only (Admin -> Variety page, seed script, writer brief). Areas are switched off, never deleted.
grant select, insert, update on table public.question_coverage_areas to service_role;

create table public.question_tags (
  game text not null check (game in ('speed', 'live')),
  question_ref text not null check (length(question_ref) between 1 and 200),
  category text not null check (length(category) between 1 and 80),
  area_id uuid,
  era text check (era is null or length(era) between 1 and 40),
  subject text not null check (length(subject) between 1 and 120),
  subject_key text not null check (length(subject_key) between 1 and 120),
  -- When the question was written (Speed: trivia_questions.created_at). Null = unknown, treated as old. D15's 30-day
  -- gap reads this, never tagged_at, so the one-time tagging run doesn't put every subject inside the gap.
  written_at timestamptz,
  tagged_at timestamptz not null default now(),
  tagged_by text check (tagged_by is null or length(tagged_by) <= 120),
  primary key (game, question_ref),
  constraint question_tags_speed_ref check (game <> 'speed'
    or question_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint question_tags_era_needs_area check (area_id is not null or era is null),
  -- A tag's area belongs to the same game and category.
  constraint question_tags_area foreign key (area_id, game, category)
    references public.question_coverage_areas (id, game, category) on delete restrict
);
create index question_tags_cell on public.question_tags (game, area_id, era);
create index question_tags_subject on public.question_tags (game, subject_key);
alter table public.question_tags enable row level security;
alter table public.question_tags force row level security;
revoke all on table public.question_tags from public, anon, authenticated;
grant select, insert, update, delete on table public.question_tags to service_role;

create table public.speed_trivia_category_flags (
  category text primary key check (length(category) between 1 and 80),
  visible boolean not null,
  active_count int not null check (active_count >= 0),
  threshold int not null check (threshold > 0),
  checked_at timestamptz not null default now()
);
alter table public.speed_trivia_category_flags enable row level security;
alter table public.speed_trivia_category_flags force row level security;
revoke all on table public.speed_trivia_category_flags from public, anon, authenticated;
-- Read by the player API through the server client; written only by speed_trivia_refresh_category_visibility.
grant select on table public.speed_trivia_category_flags to service_role;
-- D11: Current Events starts hidden until it has 60 active questions.
insert into public.speed_trivia_category_flags (category, visible, active_count, threshold)
values ('Current Events', false, 0, 60);

create table public.speed_trivia_expiry_runs (
  id uuid primary key default gen_random_uuid(),
  cutoff date not null,
  created_at timestamptz not null default now(),
  -- Before-state of every retired row (the undo log), written in the same transaction as the retirement.
  rows jsonb not null check (jsonb_typeof(rows) = 'array')
);
alter table public.speed_trivia_expiry_runs enable row level security;
alter table public.speed_trivia_expiry_runs force row level security;
revoke all on table public.speed_trivia_expiry_runs from public, anon, authenticated;
grant select on table public.speed_trivia_expiry_runs to service_role;

-- The monthly expiry query reads only dated rows.
create index trivia_questions_speed_expires_on on public.trivia_questions ((speed_generation_metadata->>'expiresOn'))
  where question_pool = 'anytime_blitz' and speed_generation_metadata ? 'expiresOn';

-- Tags of questions in a game's bank: Speed = active + waiting; Live = every tagged JSON entry.
-- Text comparison on the Speed join: a Live slug never reaches a uuid cast.
create function public.question_bank_tags(p_game text) returns setof public.question_tags
language sql stable security definer set search_path = pg_catalog, public as $$
  select qt.* from public.question_tags qt where p_game = 'live' and qt.game = 'live'
  union all
  select qt.* from public.question_tags qt
  join public.trivia_questions t on t.id::text = qt.question_ref
  where p_game = 'speed' and qt.game = 'speed'
    and t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review')
$$;

-- One bounded read for the writer brief: the map, per-cell counts, and the subjects at the cap or inside the gap.
create function public.question_variety_stats(p_game text, p_cap int default 5, p_gap_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_game is null or p_game not in ('speed', 'live') or p_cap is null or p_cap < 1 or p_gap_days is null or p_gap_days < 0 then
    raise exception 'invalid-variety-request';
  end if;
  with bank as (select * from public.question_bank_tags(p_game)),
  cells as (
    select area_id, era, count(*)::int n, max(written_at) last_written from bank where area_id is not null group by 1, 2
  ),
  subjects as (
    select subject_key, mode() within group (order by subject) subject, array_agg(distinct category order by category) categories,
      count(*)::int n, max(written_at) last_written
    from bank group by 1
  )
  select jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'category', a.category, 'name', a.name, 'eras', a.eras,
        'note', a.note, 'active', a.active) order by a.category, a.position, a.name)
      from public.question_coverage_areas a where a.game = p_game), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('areaId', area_id, 'era', era, 'count', n, 'lastWritten', last_written)
      order by area_id, era) from cells), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('subjectKey', subject_key, 'subject', subject,
        'categories', to_jsonb(categories), 'count', n, 'lastWritten', last_written) order by n desc, subject_key)
      from subjects where n >= p_cap or last_written > now() - make_interval(days => p_gap_days)), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Star-cap re-check for specific candidates (D15): count and last written per subject key in the bank.
create function public.question_subject_stats(p_game text, p_keys text[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_game is null or p_game not in ('speed', 'live') or p_keys is null or cardinality(p_keys) > 200 then
    raise exception 'invalid-variety-request';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('subjectKey', subject_key, 'count', n, 'lastWritten', last_written)
    order by subject_key), '[]'::jsonb) into result
  from (
    select subject_key, count(*)::int n, max(written_at) last_written
    from public.question_bank_tags(p_game) where subject_key = any(p_keys) group by 1
  ) s;
  return result;
end $$;

-- Admin -> Variety page: one category's areas with per-era counts, plus the report (top subjects, top-5 share).
create function public.question_variety_report(p_game text, p_category text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_game is null or p_game not in ('speed', 'live') or p_category is null or length(p_category) not between 1 and 80 then
    raise exception 'invalid-variety-request';
  end if;
  with bank as (select * from public.question_bank_tags(p_game) where category = p_category),
  per as (select area_id, era, count(*)::int n from bank where area_id is not null group by 1, 2),
  subjects as (select subject_key, mode() within group (order by subject) subject, count(*)::int n from bank group by 1)
  select jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'eras', a.eras, 'note', a.note,
        'active', a.active, 'counts', coalesce((select jsonb_object_agg(per.era, per.n) from per where per.area_id = a.id), '{}'::jsonb))
        order by a.position, a.name)
      from public.question_coverage_areas a where a.game = p_game and a.category = p_category), '[]'::jsonb),
    'tagged', (select count(*)::int from bank),
    'unmapped', (select count(*)::int from bank where area_id is null),
    'untagged', case when p_game = 'speed' then (
      select count(*)::int from public.trivia_questions t
      where t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review') and t.category = p_category
        and not exists (select 1 from public.question_tags qt where qt.game = 'speed' and qt.question_ref = t.id::text)
    ) end,
    'topSubjects', coalesce((select jsonb_agg(jsonb_build_object('subject', subject, 'count', n) order by n desc, subject)
      from (select * from subjects order by n desc, subject limit 20) top), '[]'::jsonb),
    'top5Share', (select case when sum(n) > 0 then round((
        select coalesce(sum(n), 0) from (select n from subjects order by n desc limit 5) five)::numeric / sum(n), 4) end
      from subjects)
  ) into result;
  return result;
end $$;

-- D11: a gated category is shown to players only at or above its threshold of active questions.
create function public.speed_trivia_refresh_category_visibility(p_category text, p_threshold int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int;
begin
  if p_category is null or length(p_category) not between 1 and 80 or p_threshold is null or p_threshold < 1 then
    raise exception 'invalid-visibility-request';
  end if;
  select count(*)::int into n from public.trivia_questions
  where question_pool = 'anytime_blitz' and status = 'active' and category = p_category;
  insert into public.speed_trivia_category_flags (category, visible, active_count, threshold, checked_at)
  values (p_category, n >= p_threshold, n, p_threshold, now())
  on conflict (category) do update set visible = excluded.visible, active_count = excluded.active_count,
    threshold = excluded.threshold, checked_at = excluded.checked_at;
  return jsonb_build_object('category', p_category, 'activeCount', n, 'threshold', p_threshold, 'visible', n >= p_threshold);
end $$;

-- D16: retire active and waiting Speed rows whose expiresOn is on or before p_today. Dry run unless p_apply.
-- Only well-formed dates count; the before-state goes to speed_trivia_expiry_runs in the same transaction.
create function public.speed_trivia_expire_dated(p_today date, p_apply boolean, p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb; v_matched int; v_retired int := 0; v_run uuid;
begin
  if p_today is null or p_apply is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid-expiry-request';
  end if;
  if p_apply then
    -- Control row first, then the question rows (the admission RPCs' order).
    perform 1 from public.speed_trivia_control where singleton for update;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb), count(*)::int into v_rows, v_matched
    from (
      select t.* from public.trivia_questions t
      where t.question_pool = 'anytime_blitz' and t.speed_generation_metadata ? 'expiresOn'
        and t.status in ('active', 'pending_review')
        and (t.speed_generation_metadata->>'expiresOn') ~ '^\d{4}-\d{2}-\d{2}$'
        and (t.speed_generation_metadata->>'expiresOn') <= to_char(p_today, 'YYYY-MM-DD')
      order by t.id limit p_limit
      for update of t
    ) q;
  else
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb), count(*)::int into v_rows, v_matched
    from (
      select t.* from public.trivia_questions t
      where t.question_pool = 'anytime_blitz' and t.speed_generation_metadata ? 'expiresOn'
        and t.status in ('active', 'pending_review')
        and (t.speed_generation_metadata->>'expiresOn') ~ '^\d{4}-\d{2}-\d{2}$'
        and (t.speed_generation_metadata->>'expiresOn') <= to_char(p_today, 'YYYY-MM-DD')
      order by t.id limit p_limit
    ) q;
  end if;
  if not p_apply or v_matched = 0 then
    return jsonb_build_object('mode', case when p_apply then 'apply' else 'dry-run' end, 'cutoff', p_today,
      'matched', v_matched, 'retired', 0, 'runId', null,
      'ids', coalesce((select jsonb_agg(r->'id') from jsonb_array_elements(v_rows) r), '[]'::jsonb));
  end if;
  insert into public.speed_trivia_expiry_runs (cutoff, rows) values (p_today, v_rows) returning id into v_run;
  update public.trivia_questions set status = 'deleted'
  where id in (select (r->>'id')::uuid from jsonb_array_elements(v_rows) r)
    and question_pool = 'anytime_blitz' and status in ('active', 'pending_review');
  get diagnostics v_retired = row_count;
  return jsonb_build_object('mode', 'apply', 'cutoff', p_today, 'matched', v_matched, 'retired', v_retired, 'runId', v_run,
    'ids', (select jsonb_agg(r->'id') from jsonb_array_elements(v_rows) r));
end $$;

revoke all on function public.question_bank_tags(text) from public, anon, authenticated;
revoke all on function public.question_variety_stats(text, int, int) from public, anon, authenticated;
revoke all on function public.question_subject_stats(text, text[]) from public, anon, authenticated;
revoke all on function public.question_variety_report(text, text) from public, anon, authenticated;
revoke all on function public.speed_trivia_refresh_category_visibility(text, int) from public, anon, authenticated;
revoke all on function public.speed_trivia_expire_dated(date, boolean, int) from public, anon, authenticated;
grant execute on function public.question_bank_tags(text) to service_role;
grant execute on function public.question_variety_stats(text, int, int) to service_role;
grant execute on function public.question_subject_stats(text, text[]) to service_role;
grant execute on function public.question_variety_report(text, text) to service_role;
grant execute on function public.speed_trivia_refresh_category_visibility(text, int) to service_role;
grant execute on function public.speed_trivia_expire_dated(date, boolean, int) to service_role;
