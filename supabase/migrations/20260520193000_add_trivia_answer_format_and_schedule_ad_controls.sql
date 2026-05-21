alter table trivia_questions
  add column if not exists answer_format text;

update trivia_questions
set answer_format = coalesce(nullif(btrim(answer_format), ''), 'multiple_choice');

alter table trivia_questions
  alter column answer_format set default 'multiple_choice';

alter table trivia_questions
  alter column answer_format set not null;

alter table trivia_questions
  drop constraint if exists trivia_questions_answer_format_valid;

alter table trivia_questions
  add constraint trivia_questions_answer_format_valid
  check (answer_format in ('multiple_choice', 'write_in', 'numeric', 'true_false'));

alter table trivia_schedules
  add column if not exists intermission_ad_delay_seconds integer default 10;

alter table trivia_schedules
  add column if not exists lobby_ad_enabled boolean default true;

update trivia_schedules
set
  intermission_ad_delay_seconds = coalesce(intermission_ad_delay_seconds, 10),
  lobby_ad_enabled = coalesce(lobby_ad_enabled, true);

alter table trivia_schedules
  alter column intermission_ad_delay_seconds set default 10;

alter table trivia_schedules
  alter column intermission_ad_delay_seconds set not null;

alter table trivia_schedules
  alter column lobby_ad_enabled set default true;

alter table trivia_schedules
  alter column lobby_ad_enabled set not null;

alter table trivia_schedules
  drop constraint if exists trivia_schedules_intermission_ad_delay_seconds_valid;

alter table trivia_schedules
  add constraint trivia_schedules_intermission_ad_delay_seconds_valid
  check (intermission_ad_delay_seconds >= 0 and intermission_ad_delay_seconds <= 300);
