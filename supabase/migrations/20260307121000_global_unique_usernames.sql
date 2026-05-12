alter table users
drop constraint if exists users_unique_username_per_venue;

do $$
begin
  if exists (
    select 1
    from (
      select lower(username) as username_key
      from users
      where username is not null
      group by lower(username)
      having count(*) > 1
    ) duplicates
  ) then
    raise notice 'Skipping users_unique_username_global_ci due to existing duplicate usernames.';
  else
    create unique index if not exists users_unique_username_global_ci
    on users ((lower(username)));
  end if;
end
$$;
