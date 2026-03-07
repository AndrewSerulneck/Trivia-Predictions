alter table users
add column if not exists pin_salt text,
add column if not exists pin_hash text;
