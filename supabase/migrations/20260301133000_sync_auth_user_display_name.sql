-- Keep Supabase Auth user metadata aligned with app-level usernames.
-- This makes auth.users entries easier to inspect in the dashboard.

create or replace function public.sync_auth_user_display_name()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.auth_id is null then
    return new;
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'display_name', new.username,
    'username', new.username,
    'venue_id', new.venue_id
  )
  where id = new.auth_id;

  return new;
end;
$$;

drop trigger if exists users_sync_auth_display_name on public.users;
create trigger users_sync_auth_display_name
after insert or update of auth_id, username, venue_id on public.users
for each row
execute function public.sync_auth_user_display_name();

-- Backfill existing auth users from current app users.
with latest_profile as (
  select distinct on (auth_id)
    auth_id,
    username,
    venue_id
  from public.users
  where auth_id is not null
  order by auth_id, updated_at desc
)
update auth.users as au
set raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'display_name', lp.username,
  'username', lp.username,
  'venue_id', lp.venue_id
)
from latest_profile as lp
where au.id = lp.auth_id;
