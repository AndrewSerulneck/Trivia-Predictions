# Rewards — Partner Create-Reward Gating & Cadence Plan

> **Status:** Planning. No code written yet.
> **Source:** Partner-facing feedback on the Create Reward flow (`+ Create Reward`
> → Live Trivia Challenge) in the Partner Dashboard.
> **Created:** 2026-07-20
> **Surfaces:** `components/rewards/CreateRewardWizard.tsx` (shared admin+owner
> wizard), `lib/rewards.ts`, `lib/rewardDefinitions.ts`, the owner routes
> (`app/api/owner/rewards/route.ts` + `/context/route.ts`) and the admin route
> (`app/api/admin/route.ts`, `resource: "rewards"` / `"reward-context"`).

## Requests being addressed

1. **Unscheduled → clear "schedule it first" message.** When a partner picks
   **Live Trivia Challenge** but has **no Live Trivia scheduled** at their venue,
   they must get an explicit message telling them to schedule Live Trivia at their
   venue before they can offer a Live Trivia reward.
2. **Points target must be a multiple of 10.** Live Trivia questions are worth 10
   points, so the points-to-win target must be a multiple of 10 (presets and
   custom entry alike).
3. **Always show "Recurring", gate it with a clear error.** The recurring cadence
   option should be **visible** even when the venue only has a one-off Live Trivia
   schedule — but attempting to create a recurring reward without a **recurring**
   Live Trivia schedule must be **denied with an explanatory error** ("set Live
   Trivia to a recurring schedule first").

## Diagnosis (current behavior)

- **Request 1 is currently broken, not just missing copy.**
  `CreateRewardWizard.handlePickDefinition` calls `setStep("cadence")`
  *unconditionally* after the context resolves. The "schedule Live Trivia first"
  amber block is only rendered inside the `definition` step
  (`CreateRewardWizard.tsx:315`), so when the game isn't scheduled the user is
  pushed onto an **empty cadence step** (no options) and never sees the message.
- **Request 3 — why no "Recurring" today.** `resolveRewardCreationContext`
  (`lib/rewards.ts:144-148`) only adds `"weekly"` to `allowedCadences` when
  `hasRecurringSchedule && scheduleDays.length > 0`. The venue in question almost
  certainly has a **one-off** Live Trivia schedule, so `allowedCadences` is
  `["none"]` and the wizard shows only "One-off". (If *nothing* were scheduled the
  partner would instead hit the Request-1 block.) So the answer to the partner's
  question is: it's because there's no **recurring** Live Trivia schedule — not
  because nothing is scheduled.
- **Request 2.** The preset `thresholdOptions` `[300, 500, 750, 1000]` are already
  multiples of 10, but the **custom target** `<input type="number">`
  (`CreateRewardWizard.tsx:372`) accepts any integer, and `createReward`
  (`lib/rewards.ts:270`) only checks `threshold >= 1`. No multiple-of-10 guard on
  either side.

## Design principle carried forward

Rewards stay a **thin definition + gating layer** over `challenge_campaigns`
(`lib/rewards.ts` header, `CLAUDE.md` Rewards section). The wizard is **one shared
component** for both hosts (`variant: "admin" | "owner"`) — do not fork it. Server
sentinels (the `REWARD_*_MESSAGE` constants) remain the source of truth for
validation, mapped to HTTP 400 in both routes; the client mirrors them only for
inline UX. The `SUPPORTED_REWARD_CADENCES = ["none", "weekly"]` limit and the
empty-`scheduleDays` epoch-sentinel guard (from the code-review-fixes plan, Phase
2/4) must both be preserved.

## Phasing rationale

Each request is independent and can ship on its own; ordering is by blast radius.
**Phase 1** is a contained client-only bug fix (highest user impact, lowest risk).
**Phase 2** adds a per-definition granularity field and a symmetric client+server
guard. **Phase 3** is the most nuanced — it changes the offered-vs-allowed cadence
semantics across the context resolver, the DTO, the wizard, and **both** route
error maps, and must not regress the existing epoch-sentinel guard — so it gets the
most scrutiny and its own phase.

## Phases

| Phase | Scope | Model | Effort |
|---|---|---|---|
| **1. Show the "schedule Live Trivia first" message (Request 1)** | In `CreateRewardWizard.handlePickDefinition`, only advance to the `cadence` step when `ctx.scheduled` **and** `ctx.allowedCadences.length > 0`; otherwise stay on the `definition` step so the existing unscheduled block renders. Rework that block's copy into an explicit instruction ("You must schedule Live Trivia at this venue before you can offer a Live Trivia reward.") keeping the `Schedule Live Trivia` link (`scheduleLinkHref`). Verify the same behavior in **both** variants (admin + owner). No server change. | **Sonnet 5** | **Low** — one control-flow fix + copy; client-only, both variants share the JSX. |
| **2. Enforce a multiple-of-10 points target (Request 2)** | Add a `thresholdStep: number` field to `RewardDefinition` (`lib/rewardDefinitions.ts`), set to `10` for `live_trivia_challenge` (documented as "points per Live Trivia question"); confirm every `thresholdOptions` entry is divisible by it. Wizard: drive the custom `<input>` `step`/`min` from `definition.thresholdStep`, snap the custom value to the nearest multiple on change/blur, and show helper copy ("Must be a multiple of 10"). Server: in `createReward`, reject `threshold % definition.thresholdStep !== 0` (or `< thresholdStep`) with a clearer `REWARD_INVALID_THRESHOLD_MESSAGE` (reused; tighten wording to mention the step). Add Vitest cases in `tests/lib.rewards-definitions.test.ts` for a non-multiple threshold (rejected) and a valid one. | **Sonnet 5** | **Low-Medium** — mechanical, but touches the definition registry, the wizard input, the server validator, and tests; keep the field generic so future rewards with other point granularities just set their own step. |
| **3. Always offer "Recurring"; deny with a clear error when the schedule isn't recurring (Request 3)** | **Context resolver** (`lib/rewards.ts`): introduce `offeredCadences` (what the UI shows) distinct from `allowedCadences` (what's actually permitted). `offeredCadences` includes `"weekly"` whenever `scheduled` (regardless of `hasRecurringSchedule`), intersected with `SUPPORTED_REWARD_CADENCES`; `allowedCadences` keeps today's stricter rule (`hasRecurringSchedule && scheduleDays.length > 0`). Add both to `RewardCreationContext` and the `RewardCreationContextDTO`. **New sentinel** `REWARD_REQUIRES_RECURRING_SCHEDULE_MESSAGE` ("Set Live Trivia to a recurring schedule at this venue before offering a recurring reward."). In `createReward`, when `cadence` is recurring but not in `allowedCadences` (i.e. no recurring schedule / no weekday anchor), throw the new sentinel instead of the generic `REWARD_UNSUPPORTED_CADENCE_MESSAGE`; preserve the existing empty-`scheduleDays` defense. Map the new sentinel to **400** in **both** `app/api/owner/rewards/route.ts` and `app/api/admin/route.ts`. **Wizard**: render `offeredCadences` for the chips; when the selected cadence is offered-but-not-allowed, show an inline explanatory message and block "Next: Prize" (server remains the backstop and returns the same message on submit). Update the cadence help text so "Recurring" reads clearly. Add Vitest cases: one-off schedule → `offeredCadences` includes weekly but `allowedCadences` does not, and `createReward(weekly)` throws the new sentinel; recurring schedule → weekly allowed and succeeds. | **Opus 4.8** | **Medium** — small diffs but spread across resolver semantics, a new sentinel in two route error-maps, the shared DTO, and wizard gating UX; must not regress the epoch-sentinel guard or the `SUPPORTED_REWARD_CADENCES` limit, so it warrants the extra care. |

## Definition of done

- All three requests behave as described for **both** the Partner Dashboard
  (`/owner`) and the admin Rewards section, since they share the wizard.
- `npx tsc --noEmit`, `npm run lint`, `npm run test`, and
  `npm run test:god-mode-join` are green after each phase.
- New/adjusted server validation is covered by Vitest in
  `tests/lib.rewards-definitions.test.ts` (multiple-of-10 rejection; weekly-without-
  recurring-schedule rejection with the new sentinel), and the new sentinel is
  wired into **both** route error maps (400).
- Manual/browser sanity via the `verify` skill against a seeded venue: (a) no
  schedule → block + link, no cadence step; (b) one-off schedule → "Recurring"
  visible, selecting it shows the inline error and blocks, submit is denied 400
  with the recurring-schedule message; (c) recurring schedule → weekly succeeds;
  (d) a non-multiple-of-10 custom target is snapped/rejected.

## Notes / open choices

- **Where "Recurring" gating message appears.** Recommended: show it **inline the
  moment the partner selects the recurring chip** (best UX) *and* keep the server
  400 as the backstop — rather than only surfacing it on submit. The phase builds
  both; if you'd prefer submit-only denial, drop the inline block and rely on the
  route error.
- **`thresholdStep` is per-definition, not global**, so a future reward tied to a
  game with a different point value just declares its own step — consistent with
  the "adding a reward = one registry entry" rule in `AGENTS.md`.
