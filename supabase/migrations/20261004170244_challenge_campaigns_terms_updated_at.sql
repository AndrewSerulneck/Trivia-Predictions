-- challenge_campaigns.terms_updated_at — when a reward's WIN TERMS last changed.
--
-- Why (docs/reward-descriptions-review-fixes-plan.md, F6 / Phase 4): a prize-wallet
-- coupon says what it was won for ("You earned 500 points the week of Oct 6") by
-- reading the reward's terms as they are NOW. If a partner later edits the target
-- or the scope, an old coupon would silently describe the new terms. The wallet
-- compares this stamp with the coupon's award time (challenge_campaign_redemptions
-- .created_at) and falls back to "Won from: {name}" when the terms changed after
-- the win.
--
-- Why not a plain updated_at: the system itself writes this table at award time
-- (winner_user_id / is_active when a one-off reward is spent), and admins reorder
-- and restyle rewards. A generic stamp would flag almost every coupon. This one
-- moves ONLY when a column the "You won …" sentence reads actually changes.
--
-- NULL = not changed since this column was added. Edits made before this
-- migration are unknowable; those coupons keep today's behaviour.
--
-- Adds a column to an existing table and a trigger function: no new table, view
-- or sequence, so no Data API grant is needed (SECURE_TABLE_MIGRATION_CHECKLIST.md).

alter table public.challenge_campaigns
  add column if not exists terms_updated_at timestamptz;

create or replace function public.challenge_campaigns_stamp_terms_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reward_definition_id is distinct from old.reward_definition_id
    or new.win_condition is distinct from old.win_condition
    or new.recurring_type is distinct from old.recurring_type
    or new.points_required_to_win is distinct from old.points_required_to_win
    or new.nfl_week_scope is distinct from old.nfl_week_scope
  then
    new.terms_updated_at := now();
  end if;
  return new;
end;
$$;

-- A trigger function is not an RPC; keep it off the browser roles.
revoke all on function public.challenge_campaigns_stamp_terms_updated_at() from public, anon, authenticated;
grant execute on function public.challenge_campaigns_stamp_terms_updated_at() to service_role;

drop trigger if exists challenge_campaigns_stamp_terms_updated_at on public.challenge_campaigns;
create trigger challenge_campaigns_stamp_terms_updated_at
before update on public.challenge_campaigns
for each row execute function public.challenge_campaigns_stamp_terms_updated_at();
