-- Speed Trivia star cap on a re-tag (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.8, post-4c.4 review #4; D15).
-- No question or tag is changed by this migration.
--
-- * The admission guard (guard_speed_trivia_write, 20261116014954) checks the cap only when a Speed row BECOMES
--   active. Editing an active question re-tags it, and a plain question_tags upsert could move it into a subject that
--   already has 5 active rows. guard_speed_question_tag refuses that ('star-cap'). It acts only on a Speed tag whose
--   subject changes, and only while the row is active; waiting, retired and Live rows, and an unchanged subject, pass.
--   Existing rows are never touched (none is over the cap: 1,916 subjects, at most 5 each, 2026-11-17).
-- * An upsert fires the INSERT trigger first even when the row exists, so "the subject changes" is decided against the
--   stored tag, not TG_OP.
-- * speed_trivia_subject_has_room: the same count, so Admin can refuse an edit before saving it ('subject_full').
-- Lock order matches the admission RPCs: the control row first, then the count.

create function public.guard_speed_question_tag() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare stored_key text; others bigint;
begin
  -- question_tags_speed_ref (a CHECK) runs after this trigger; leave a malformed ref for it to refuse.
  if new.game <> 'speed' or new.subject_key is null
     or new.question_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  select qt.subject_key into stored_key from public.question_tags qt
  where qt.game = 'speed' and qt.question_ref = new.question_ref;
  if stored_key is not distinct from new.subject_key then
    return new;
  end if;
  -- Same lock as the admission guard, so an approval and a re-tag can't both take the last place.
  perform 1 from public.speed_trivia_control where singleton for update;
  if not exists (select 1 from public.trivia_questions t where t.id = new.question_ref::uuid
                 and t.question_pool = 'anytime_blitz' and t.status = 'active') then
    return new;
  end if;
  select count(*) into others from public.question_tags o
  join public.trivia_questions t on t.id = o.question_ref::uuid
  where o.game = 'speed' and o.subject_key = new.subject_key and o.question_ref <> new.question_ref
    and t.question_pool = 'anytime_blitz' and t.status = 'active';
  if others >= 5 then
    raise exception 'star-cap';
  end if;
  return new;
end $$;

create trigger guard_speed_question_tag
before insert or update of game, question_ref, subject_key on public.question_tags
for each row execute function public.guard_speed_question_tag();

-- True while fewer than 5 OTHER active Speed rows carry p_subject_key (the count in speed_trivia_star_cap_state).
-- Advisory: the trigger above is the binding check.
create function public.speed_trivia_subject_has_room(p_subject_key text, p_row_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select (select count(*) from public.question_tags o
          join public.trivia_questions t on t.id = o.question_ref::uuid
          where o.game = 'speed' and o.subject_key = p_subject_key and o.question_ref <> p_row_id::text
            and t.question_pool = 'anytime_blitz' and t.status = 'active') < 5
$$;

-- The trigger function is never called directly (as the admission guard, no role may execute it).
revoke all on function public.guard_speed_question_tag() from public, anon, authenticated, service_role;
revoke all on function public.speed_trivia_subject_has_room(text, uuid) from public, anon, authenticated;
grant execute on function public.speed_trivia_subject_has_room(text, uuid) to service_role;
