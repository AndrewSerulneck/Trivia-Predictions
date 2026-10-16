-- Read-only: the query plans of the Partner Results player breakdown reads
-- (docs/partner-results-page-plan.md §5d, Phase 3). Never writes: everything runs inside a
-- READ ONLY transaction that is rolled back. Prints plans only, never a player id or an answer.
-- It picks the busiest recent Live Trivia game and that game's top scorer by itself.
--
-- Run: npm run results:explain-breakdown
--   (= supabase db query --linked -f scripts/explain-results-breakdown.sql)
--
-- The game / player are scalar subqueries (InitPlans), standing in for the route's bound
-- parameters. Run once as is (the plan the planner picks today), and once with the
-- `set local enable_seqscan = off` line uncommented to see the index plan it would use once the
-- table is large.
--
-- Measured 2026-10-16 (599 answer rows): both runs pick the same plan, an Index Scan on
-- live_showdown_answers_occurrence_unique with all three conditions (schedule_id, occurrence_date,
-- user_id) in the index, plus one trivia_questions slug-index lookup per answer; ~1-4 ms. No new
-- index is needed.
begin read only;
-- set local enable_seqscan = off;

explain (analyze, buffers, costs, timing)
-- As PostgREST runs `select("…, question:trivia_questions(question)")`: a lateral lookup by slug.
select a.is_correct, a.points_awarded, a.round_number, a.question_index, q.question
from live_showdown_answers a
left join lateral (select question from trivia_questions where slug = a.question_id) q on true
where a.schedule_id = (
    select schedule_id from live_showdown_answers
    where occurrence_date > '1970-01-01'
    group by schedule_id, occurrence_date
    order by count(*) desc, occurrence_date desc
    limit 1)
  and a.occurrence_date = (
    select occurrence_date from live_showdown_answers
    where occurrence_date > '1970-01-01'
    group by schedule_id, occurrence_date
    order by count(*) desc, occurrence_date desc
    limit 1)
  and a.user_id = (
    select user_id from live_showdown_answers
    where (schedule_id, occurrence_date) = (
      select schedule_id, occurrence_date from live_showdown_answers
      where occurrence_date > '1970-01-01'
      group by schedule_id, occurrence_date
      order by count(*) desc, occurrence_date desc
      limit 1)
    group by user_id
    order by sum(points_awarded) desc
    limit 1)
order by a.round_number, a.question_index
limit 1000;

rollback;
