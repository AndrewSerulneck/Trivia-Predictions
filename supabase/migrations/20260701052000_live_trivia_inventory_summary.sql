-- Maintains precomputed Live Trivia inventory counts for the admin dashboard.
-- This avoids scanning venue_seen_questions for every venue whenever the
-- Question Inventory page loads.

create table if not exists public.venue_live_trivia_inventory_summary (
  venue_id      text not null references public.venues(id) on delete cascade,
  category      text not null,
  total_active  integer not null default 0,
  seen_active   integer not null default 0,
  unseen_active integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (venue_id, category),
  constraint venue_live_trivia_inventory_summary_counts_non_negative
    check (total_active >= 0 and seen_active >= 0 and unseen_active >= 0),
  constraint venue_live_trivia_inventory_summary_seen_not_gt_total
    check (seen_active <= total_active),
  constraint venue_live_trivia_inventory_summary_unseen_matches_total
    check (unseen_active = total_active - seen_active)
);

create index if not exists venue_live_trivia_inventory_summary_venue_idx
  on public.venue_live_trivia_inventory_summary (venue_id);

alter table public.venue_live_trivia_inventory_summary enable row level security;
alter table public.venue_live_trivia_inventory_summary force row level security;
revoke all on table public.venue_live_trivia_inventory_summary from anon, authenticated;

create or replace function public.live_trivia_inventory_category(value text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(value), ''), 'Uncategorized')
$$;

create or replace function public.refresh_live_trivia_inventory_summary_for_venue_category(
  target_venue_id text,
  target_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_category text := public.live_trivia_inventory_category(target_category);
  total_count integer := 0;
  seen_count integer := 0;
begin
  if not exists (select 1 from public.venues where id = target_venue_id) then
    delete from public.venue_live_trivia_inventory_summary
    where venue_id = target_venue_id;
    return;
  end if;

  select count(*)::integer
    into total_count
  from public.trivia_questions
  where question_pool = 'live_showdown'
    and status = 'active'
    and slug is not null
    and public.live_trivia_inventory_category(category) = normalized_category;

  if total_count <= 0 then
    delete from public.venue_live_trivia_inventory_summary
    where venue_id = target_venue_id
      and category = normalized_category;
    return;
  end if;

  select count(*)::integer
    into seen_count
  from public.venue_seen_questions vsq
  join public.trivia_questions tq
    on tq.slug = vsq.question_id
  where vsq.venue_id = target_venue_id
    and tq.question_pool = 'live_showdown'
    and tq.status = 'active'
    and tq.slug is not null
    and public.live_trivia_inventory_category(tq.category) = normalized_category;

  insert into public.venue_live_trivia_inventory_summary (
    venue_id,
    category,
    total_active,
    seen_active,
    unseen_active,
    updated_at
  )
  values (
    target_venue_id,
    normalized_category,
    total_count,
    least(seen_count, total_count),
    greatest(total_count - least(seen_count, total_count), 0),
    now()
  )
  on conflict (venue_id, category) do update
    set total_active = excluded.total_active,
        seen_active = excluded.seen_active,
        unseen_active = excluded.unseen_active,
        updated_at = now();
end;
$$;

create or replace function public.refresh_live_trivia_inventory_summary_for_category(target_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_category text := public.live_trivia_inventory_category(target_category);
  total_count integer := 0;
begin
  select count(*)::integer
    into total_count
  from public.trivia_questions
  where question_pool = 'live_showdown'
    and status = 'active'
    and slug is not null
    and public.live_trivia_inventory_category(category) = normalized_category;

  if total_count <= 0 then
    delete from public.venue_live_trivia_inventory_summary
    where category = normalized_category;
    return;
  end if;

  insert into public.venue_live_trivia_inventory_summary (
    venue_id,
    category,
    total_active,
    seen_active,
    unseen_active,
    updated_at
  )
  select
    v.id,
    normalized_category,
    total_count,
    least(coalesce(sc.seen_count, 0), total_count),
    greatest(total_count - least(coalesce(sc.seen_count, 0), total_count), 0),
    now()
  from public.venues v
  left join (
    select
      vsq.venue_id,
      count(*)::integer as seen_count
    from public.venue_seen_questions vsq
    join public.trivia_questions tq
      on tq.slug = vsq.question_id
    where tq.question_pool = 'live_showdown'
      and tq.status = 'active'
      and tq.slug is not null
      and public.live_trivia_inventory_category(tq.category) = normalized_category
    group by vsq.venue_id
  ) sc on sc.venue_id = v.id
  on conflict (venue_id, category) do update
    set total_active = excluded.total_active,
        seen_active = excluded.seen_active,
        unseen_active = excluded.unseen_active,
        updated_at = now();
end;
$$;

create or replace function public.refresh_live_trivia_inventory_summary_for_venue(target_venue_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.venues where id = target_venue_id) then
    delete from public.venue_live_trivia_inventory_summary
    where venue_id = target_venue_id;
    return;
  end if;

  delete from public.venue_live_trivia_inventory_summary
  where venue_id = target_venue_id;

  insert into public.venue_live_trivia_inventory_summary (
    venue_id,
    category,
    total_active,
    seen_active,
    unseen_active,
    updated_at
  )
  with active_categories as (
    select
      public.live_trivia_inventory_category(category) as category,
      count(*)::integer as total_count
    from public.trivia_questions
    where question_pool = 'live_showdown'
      and status = 'active'
      and slug is not null
    group by public.live_trivia_inventory_category(category)
  ),
  seen_counts as (
    select
      public.live_trivia_inventory_category(tq.category) as category,
      count(*)::integer as seen_count
    from public.venue_seen_questions vsq
    join public.trivia_questions tq
      on tq.slug = vsq.question_id
    where vsq.venue_id = target_venue_id
      and tq.question_pool = 'live_showdown'
      and tq.status = 'active'
      and tq.slug is not null
    group by public.live_trivia_inventory_category(tq.category)
  )
  select
    target_venue_id,
    ac.category,
    ac.total_count,
    least(coalesce(sc.seen_count, 0), ac.total_count),
    greatest(ac.total_count - least(coalesce(sc.seen_count, 0), ac.total_count), 0),
    now()
  from active_categories ac
  left join seen_counts sc on sc.category = ac.category;
end;
$$;

create or replace function public.refresh_live_trivia_inventory_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.venue_live_trivia_inventory_summary;

  insert into public.venue_live_trivia_inventory_summary (
    venue_id,
    category,
    total_active,
    seen_active,
    unseen_active,
    updated_at
  )
  with active_categories as (
    select
      public.live_trivia_inventory_category(category) as category,
      count(*)::integer as total_count
    from public.trivia_questions
    where question_pool = 'live_showdown'
      and status = 'active'
      and slug is not null
    group by public.live_trivia_inventory_category(category)
  ),
  seen_counts as (
    select
      vsq.venue_id,
      public.live_trivia_inventory_category(tq.category) as category,
      count(*)::integer as seen_count
    from public.venue_seen_questions vsq
    join public.trivia_questions tq
      on tq.slug = vsq.question_id
    where tq.question_pool = 'live_showdown'
      and tq.status = 'active'
      and tq.slug is not null
    group by vsq.venue_id, public.live_trivia_inventory_category(tq.category)
  )
  select
    v.id,
    ac.category,
    ac.total_count,
    least(coalesce(sc.seen_count, 0), ac.total_count),
    greatest(ac.total_count - least(coalesce(sc.seen_count, 0), ac.total_count), 0),
    now()
  from public.venues v
  cross join active_categories ac
  left join seen_counts sc
    on sc.venue_id = v.id
   and sc.category = ac.category;
end;
$$;

create or replace function public.live_trivia_inventory_seen_questions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_category text;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    select public.live_trivia_inventory_category(category)
      into affected_category
    from public.trivia_questions
    where slug = old.question_id
      and question_pool = 'live_showdown'
      and status = 'active'
      and slug is not null;

    if affected_category is not null then
      perform public.refresh_live_trivia_inventory_summary_for_venue_category(old.venue_id, affected_category);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select public.live_trivia_inventory_category(category)
      into affected_category
    from public.trivia_questions
    where slug = new.question_id
      and question_pool = 'live_showdown'
      and status = 'active'
      and slug is not null;

    if affected_category is not null then
      perform public.refresh_live_trivia_inventory_summary_for_venue_category(new.venue_id, affected_category);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.live_trivia_inventory_questions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.question_pool = 'live_showdown' then
    perform public.refresh_live_trivia_inventory_summary_for_category(old.category);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.question_pool = 'live_showdown' then
    perform public.refresh_live_trivia_inventory_summary_for_category(new.category);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.live_trivia_inventory_venues_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_live_trivia_inventory_summary_for_venue(new.id);
  return new;
end;
$$;

drop trigger if exists venue_seen_questions_live_trivia_inventory_summary on public.venue_seen_questions;
create trigger venue_seen_questions_live_trivia_inventory_summary
after insert or update or delete on public.venue_seen_questions
for each row
execute function public.live_trivia_inventory_seen_questions_trigger();

drop trigger if exists trivia_questions_live_trivia_inventory_summary_insert on public.trivia_questions;
create trigger trivia_questions_live_trivia_inventory_summary_insert
after insert on public.trivia_questions
for each row
when (new.question_pool = 'live_showdown')
execute function public.live_trivia_inventory_questions_trigger();

drop trigger if exists trivia_questions_live_trivia_inventory_summary_update on public.trivia_questions;
create trigger trivia_questions_live_trivia_inventory_summary_update
after update of slug, category, status, question_pool on public.trivia_questions
for each row
when (
  old.slug is distinct from new.slug
  or old.category is distinct from new.category
  or old.status is distinct from new.status
  or old.question_pool is distinct from new.question_pool
)
execute function public.live_trivia_inventory_questions_trigger();

drop trigger if exists trivia_questions_live_trivia_inventory_summary_delete on public.trivia_questions;
create trigger trivia_questions_live_trivia_inventory_summary_delete
after delete on public.trivia_questions
for each row
when (old.question_pool = 'live_showdown')
execute function public.live_trivia_inventory_questions_trigger();

drop trigger if exists venues_live_trivia_inventory_summary_insert on public.venues;
create trigger venues_live_trivia_inventory_summary_insert
after insert on public.venues
for each row
execute function public.live_trivia_inventory_venues_trigger();

select public.refresh_live_trivia_inventory_summary();
