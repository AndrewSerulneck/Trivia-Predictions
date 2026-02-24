-- Allow flexible usernames (including spaces/symbols) by removing the
-- strict regex check from the baseline schema.

alter table users
  drop constraint if exists users_username_format;
