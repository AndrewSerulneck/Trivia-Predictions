-- Partner Self-Serve Signup — review-fix Phase 2, Finding #6.
-- docs/self-serve-signup-review-fixes-plan.md §3 Phase 2.
--
-- lib/rateLimit.ts was a read-then-write: SELECT the attempts inside the window,
-- decide, then INSERT. Between those two round trips nothing held a lock, so N
-- concurrent requests from one IP all read the same under-quota count and all
-- inserted. Measured against the strictest bucket (POST /api/owner/signup,
-- 5/hour) that let a scripted caller create roughly 40 accounts and 40 venues
-- against a cap of 5.
--
-- The fix is the same shape the Rewards multi-winner quota uses
-- (award_cycle_winner, 20260720130000_rewards_multi_winner.sql): a
-- transaction-scoped advisory lock keyed on the contended identity, then
-- count-then-insert inside it. Each PostgREST RPC call is its own implicit
-- transaction, so the lock is taken and released per call with no cleanup path.
--
-- HARD RULE (CLAUDE.md, Phase 7): the quota check lives here, in Postgres. Never
-- re-implement it as a TypeScript read-then-write — that is the bug this
-- migration exists to close.

create or replace function public.claim_signup_attempt(
  p_ip_hash text,
  p_window_seconds integer,
  p_max integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
-- SECURITY INVOKER (the default), NOT definer. `signup_attempts` carries FORCE
-- ROW LEVEL SECURITY and exactly one policy — service_role, FOR ALL. Running as
-- the invoker means the function is subject to that same policy, which is the
-- access path the limiter already uses and proves in production. A definer
-- function would instead run as the migration owner and lean on that role
-- bypassing RLS, quietly undoing the FORCE the table was created with. It also
-- makes the blast radius of a future mis-grant safe: EXECUTE handed to anon
-- would still hit RLS on the insert and fail, and the limiter fails closed.
set search_path = public
as $$
declare
  -- Mirrors lib/rateLimit.ts's own clamping so a bad caller cannot widen the
  -- window or the quota from the client side of the RPC.
  v_window integer := greatest(1, coalesce(p_window_seconds, 60));
  v_max integer := greatest(1, coalesce(p_max, 1));
  v_since timestamptz;
  v_count integer;
  v_oldest timestamptz;
begin
  -- Fail closed on a missing bucket key rather than lumping every caller into
  -- one unhashed row.
  if p_ip_hash is null or length(btrim(p_ip_hash)) = 0 then
    allowed := false;
    retry_after_seconds := v_window;
    return next;
    return;
  end if;

  -- Serialize every concurrent claim for this hashed IP + bucket. Auto-released
  -- at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  v_since := now() - make_interval(secs => v_window);

  select count(*), min(created_at)
    into v_count, v_oldest
  from signup_attempts
  where ip_hash = p_ip_hash
    and created_at >= v_since;

  if v_count >= v_max then
    -- The oldest live attempt is the one whose expiry frees the next slot.
    -- Clamped to [1, window] so a clock skew can never advertise a longer wait
    -- than the window itself.
    allowed := false;
    retry_after_seconds := greatest(
      1,
      least(
        v_window,
        ceil(extract(epoch from ((v_oldest + make_interval(secs => v_window)) - now())))::integer
      )
    );
    return next;
    return;
  end if;

  -- Only an ALLOWED call is recorded: one row means one Google-billed call, so
  -- a blocked hammering client cannot inflate our own table as a side effect of
  -- being blocked. Same contract the TypeScript limiter had.
  insert into signup_attempts (ip_hash) values (p_ip_hash);

  allowed := true;
  retry_after_seconds := 0;
  return next;
end;
$$;

comment on function public.claim_signup_attempt(text, integer, integer) is
  'Atomic sliding-window rate-limit claim for the public /api/signup/* surface. '
  'Advisory-locked count-then-insert (same pattern as award_cycle_winner). '
  'Returns (allowed, retry_after_seconds); records a row only when allowed. '
  'Sole caller: lib/rateLimit.ts.';

-- Server-only, like the table it guards: service_role (the admin client the API
-- routes use) is the only accessor. anon/authenticated must not be able to
-- write the limiter ledger through the function either.
revoke all on function public.claim_signup_attempt(text, integer, integer) from public;
revoke all on function public.claim_signup_attempt(text, integer, integer) from anon, authenticated;
grant execute on function public.claim_signup_attempt(text, integer, integer) to service_role;
