alter table users
drop constraint if exists users_unique_username_per_venue;

create unique index if not exists users_unique_username_global_ci
on users ((lower(username)));
