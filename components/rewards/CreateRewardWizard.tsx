"use client";

// Shared Create Reward wizard — ONE component that drives the canonical linear
// flow, used by BOTH the admin Rewards section
// (components/admin/sections/ChallengesSection.tsx) and the Partner Dashboard
// Rewards page (app/owner/competitions/page.tsx).
//
// Flow (docs/rewards-terms-sentence-plan.md §1, superseding the original
// definition → cadence → prize → quantity → confirm order):
//
//   definition → how it's won → points target → TERMS SENTENCE → prize → confirm
//
// "How is this reward won?" is asked FIRST because it decides whether the rest of
// the questions even make sense, and the old Single Game / Recurring chips plus
// the trailing Quantity step are replaced by one plain-English contract:
//
//   I want to make [number] of these rewards available every
//   [day/week/month/year].
//
// That sentence (lib/rewardTerms.ts) is what a points-target reward always
// shows. A game-winner reward shows it too UNLESS the game picker is enabled
// (NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED, read via isGamePickerEnabled in
// lib/rewardGameSlots.ts) — flag on replaces "how many, how often" with a
// picker over the venue's actual scheduled games, because a game-winner's
// count should be the games the partner actually picked, not a period's worth
// of them (docs/rewards-game-winner-picker-plan.md). Flag off is the legacy
// sentence, byte-for-byte, fully inert.
//
// Every option in either mode comes from a shared lib (rewardTerms.ts /
// rewardGameSlots.ts), driven by the venue's REAL Live Trivia schedule — this
// component computes none of those rules itself, so it cannot drift from the
// server that re-validates them.
//
// This component owns the step flow and prize-shape branching. It does NOT know
// about /api/admin vs /api/owner/rewards — the host page supplies `fetchContext`
// (resolveRewardCreationContext over its own auth) and `onSubmit` (POSTs to its
// own route). The two hosts have different visual systems (admin = plain
// slate/white Tailwind, owner/Partner Dashboard = dark ht-* design tokens), so
// `variant` swaps a small class-token map rather than forking the component.

import { useEffect, useMemo, useState } from "react";
import {
  REWARD_DEFINITIONS,
  isValidRewardThreshold,
  renderRewardRequirement,
  rewardThresholdStepMessage,
  type RewardDefinition,
} from "@/lib/rewardDefinitions";
import {
  REWARD_PERIOD_NOUN,
  REWARD_QUANTITY_OPTIONS,
  REWARD_TERMS_NOT_SCHEDULED_MESSAGE,
  allowedPeriodsFor,
  cadenceForPeriod,
  lockedQuantityFor,
  renderTermsSentence,
  summarizeRewardSchedules,
  validateRewardTerms,
  type RewardPeriod,
  type RewardScheduleShape,
} from "@/lib/rewardTerms";
import {
  REWARD_WEEKDAY_KEYS,
  deriveGameWinnerTerms,
  describeGameWinnerSlots,
  isGamePickerEnabled,
  selectAllRecurringSlots,
  slotKey,
  type RewardGameSlot,
} from "@/lib/rewardGameSlots";
import type { RewardPrizeInput } from "@/lib/rewards";
import {
  NFL_REWARD_MIN_PICKERS,
  NFL_WEEK_SCOPE_INVALID_MESSAGE,
  REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE,
  deriveNFLWeekScopeTerms,
  describeNFLWeekScope,
  type NFLRewardSeasonContext,
  type NFLRewardWeekScope,
  type NFLRewardWeekScopeKind,
} from "@/lib/nflPickEmRewardWeeks";
import type {
  CampaignRecurringType,
  ChallengeGameWinnerSlot,
  ChallengeWinCondition,
  RewardDiscountKind,
  RewardMenuItem,
} from "@/types";

export type RewardCreationContextDTO = {
  scheduled: boolean;
  hasRecurringSchedule: boolean;
  scheduleDays: string[];
  timezone: string | null;
  allowedCadences: CampaignRecurringType[];
  /** The venue's schedules reduced to what lib/rewardTerms.ts needs. */
  scheduleShapes: RewardScheduleShape[];
  /** The individual games a game-winner reward can be pinned to (Phase 5's picker). */
  gameSlots: RewardGameSlot[];
  /**
   * NFL Pick 'Em rewards only: the season the reward would run in and how much of
   * it is left. null for every schedule-gated definition. Optional so an older
   * cached context response still type-checks.
   */
  nflSeason?: NFLRewardSeasonContext | null;
};

export type CreateRewardSubmission = {
  venueId: string;
  definitionId: string;
  cadence: CampaignRecurringType;
  winCondition: ChallengeWinCondition;
  threshold: number;
  winnerQuota: number;
  prize: RewardPrizeInput;
  /** Game-winner picker (Phase 5), gated behind NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED. */
  gameWinnerSlots?: ChallengeGameWinnerSlot[] | null;
  /** NFL rewards: the chosen week scope. The server honors only its `kind`. */
  nflWeekScope?: NFLRewardWeekScope | null;
};

export type CreateRewardWizardVenue = { id: string; name: string };

type CreateRewardWizardProps = {
  variant: "admin" | "owner";
  venues: CreateRewardWizardVenue[];
  /** Pre-selected venue (e.g. the host page's own venue filter). Skips the venue step when it's the only option. */
  defaultVenueId?: string;
  /** Where the "schedule it first" message sends the user. */
  scheduleLinkHref: string;
  fetchContext: (venueId: string, definitionId: string) => Promise<RewardCreationContextDTO>;
  onSubmit: (submission: CreateRewardSubmission) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreated: () => void;
  onCancel: () => void;
};

/** The one definition whose terms step replaces the period sentence with a
 *  week-scope picker. Every NFL-specific branch below is gated on this id. */
const NFL_PICKEM_DEFINITION_ID = "nfl_pickem_challenge";

const MENU_ITEM_OPTIONS: Array<{ value: RewardMenuItem; label: string }> = [
  { value: "whole_order", label: "Whole Order" },
  { value: "appetizer", label: "Appetizer" },
  { value: "entree", label: "Entrée" },
  { value: "dessert", label: "Dessert" },
  { value: "wine_bottle", label: "Bottle of Wine" },
  { value: "other", label: "Other" },
];

type Styles = {
  card: string;
  heading: string;
  backLink: string;
  label: string;
  input: string;
  /** Dropdown sized to sit inside a sentence rather than fill a row. */
  inlineSelect: string;
  /** A locked, non-editable value in the sentence (game-winner quantity). */
  inlineLocked: string;
  sentence: string;
  helpText: string;
  optionCard: string;
  optionCardActive: string;
  chip: string;
  chipActive: string;
  primaryButton: string;
  secondaryButton: string;
  error: string;
  block: string;
  /** An informational callout — states a rule (e.g. the 3-player minimum),
   *  not a warning about a disabled/impossible option. */
  notice: string;
  summaryRow: string;
};

const VARIANT_STYLES: Record<"admin" | "owner", Styles> = {
  admin: {
    card: "space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
    heading: "text-base font-semibold text-slate-900",
    backLink: "text-sm font-medium text-indigo-600 hover:text-indigo-700",
    label: "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600",
    input:
      "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200",
    inlineSelect:
      "mx-1 inline-block rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-sm font-bold text-indigo-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200",
    inlineLocked:
      "mx-1 inline-block rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700",
    sentence: "text-base leading-8 text-slate-900",
    helpText: "text-xs text-slate-500",
    optionCard:
      "flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-400",
    optionCardActive: "border-indigo-500 bg-indigo-50",
    chip: "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600",
    chipActive: "border-indigo-500 bg-indigo-50 text-indigo-700",
    primaryButton:
      "w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50",
    secondaryButton: "text-sm font-medium text-slate-500 hover:text-slate-700",
    error: "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700",
    block: "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800",
    notice: "rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-medium text-sky-800",
    summaryRow: "flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm",
  },
  owner: {
    card: "space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card",
    heading: "text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300",
    backLink: "text-sm font-bold text-ht-cyan-300",
    label: "mb-1 block text-xs font-semibold text-ht-muted",
    input:
      "w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400",
    inlineSelect:
      "mx-1 inline-block rounded-xl border border-ht-cyan-400 bg-ht-elevated px-2 py-1 text-base font-black text-ht-cyan-300 outline-none focus:border-ht-cyan-300",
    inlineLocked:
      "mx-1 inline-block rounded-xl border border-ht-hairline bg-ht-elevated/60 px-2 py-1 text-base font-black text-ht-primary",
    sentence: "text-base font-bold leading-9 text-ht-primary",
    helpText: "text-xs font-semibold text-ht-muted",
    optionCard:
      "flex items-start gap-3 rounded-xl border border-ht-hairline bg-ht-elevated/50 p-3 text-left transition hover:border-ht-cyan-400",
    optionCardActive: "border-ht-cyan-400 bg-ht-elevated",
    chip: "rounded-xl border border-ht-hairline bg-ht-elevated/50 px-3 py-2 text-xs font-black text-ht-muted",
    chipActive: "border-ht-cyan-400 bg-ht-elevated text-ht-primary",
    primaryButton:
      "w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50",
    secondaryButton: "text-sm font-bold text-ht-muted",
    error: "rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300",
    block: "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-300",
    notice: "rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2.5 text-xs font-bold text-sky-200",
    summaryRow: "flex items-center justify-between gap-4 border-b border-ht-hairline/60 py-2 text-sm",
  },
};

type Step = "venue" | "definition" | "terms" | "prize" | "confirm";
type PrizeChoice = "menu_item" | "gift_card";

const EMPTY_SHAPES: RewardScheduleShape[] = [];
const EMPTY_GAME_SLOTS: RewardGameSlot[] = [];

export function CreateRewardWizard({
  variant,
  venues,
  defaultVenueId,
  scheduleLinkHref,
  fetchContext,
  onSubmit,
  onCreated,
  onCancel,
}: CreateRewardWizardProps) {
  const s = VARIANT_STYLES[variant];

  const [venueId, setVenueId] = useState(defaultVenueId ?? venues[0]?.id ?? "");
  const [definition, setDefinition] = useState<RewardDefinition | null>(null);
  const [context, setContext] = useState<RewardCreationContextDTO | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  /** Shown under the definition tiles when the picked reward's game isn't scheduled. */
  const [notScheduledError, setNotScheduledError] = useState<string | null>(null);
  /** True when notScheduledError is the NFL season message — that block has no
   *  "schedule it" link, since there's nothing the partner can schedule. */
  const [notScheduledIsNFL, setNotScheduledIsNFL] = useState(false);

  // ── Definition-step prefetch ────────────────────────────────────────────────
  // Resolved once the venue is known so picking a definition is instant. It no
  // longer disables tiles: an unscheduled reward stays clickable and answers with
  // the "schedule it first" message ON CLICK, rather than the wizard permanently
  // displaying a block the partner never asked about.
  const [definitionContexts, setDefinitionContexts] = useState<
    Record<string, RewardCreationContextDTO>
  >({});
  const [definitionContextsLoading, setDefinitionContextsLoading] = useState(false);

  const [winCondition, setWinCondition] = useState<ChallengeWinCondition>("points_threshold");
  const [threshold, setThreshold] = useState<number>(0);
  const [customThreshold, setCustomThreshold] = useState("");
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  // ── The terms sentence ──────────────────────────────────────────────────────
  // `period` null means the one-off form ("at my next Live Trivia game"), which
  // maps to cadence "none". `quantity` is only consulted when the partner chooses
  // it — a game-winner reward's number is locked to the venue's game count.
  const [period, setPeriod] = useState<RewardPeriod | null>(null);
  const [quantity, setQuantity] = useState(1);

  // ── NFL week scope (Phase 5) ─────────────────────────────────────────────
  // Replaces `period` entirely for the NFL definition: gated on the NFL season
  // calendar rather than a venue schedule, it offers exactly two shapes — see
  // lib/nflPickEmRewardWeeks.ts.
  const [nflScopeKind, setNflScopeKind] = useState<NFLRewardWeekScopeKind>("weekly");

  // ── The game picker (Phase 5, flag-gated) ───────────────────────────────────
  // Replaces the period-based sentence for game-winner rewards: the partner
  // picks exact scheduled games instead of a count. Selection is a set of
  // `scheduleId:weekday` keys — the same identity lib/rewardGameSlots.ts uses
  // everywhere else.
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());

  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>("menu_item");
  const [menuItem, setMenuItem] = useState<RewardMenuItem>("appetizer");
  const [menuItemName, setMenuItemName] = useState("");
  const [discountKind, setDiscountKind] = useState<RewardDiscountKind>("percent");
  const [discountValue, setDiscountValue] = useState("50");
  const [giftCardAmount, setGiftCardAmount] = useState("25");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const needsVenueStep = venues.length > 1 && !defaultVenueId;
  const [step, setStep] = useState<Step>(needsVenueStep ? "venue" : "definition");

  useEffect(() => {
    if (step !== "definition" || !venueId) return;
    let cancelled = false;
    setDefinitionContextsLoading(true);
    Promise.all(
      REWARD_DEFINITIONS.map(async (def) => {
        try {
          return [def.id, await fetchContext(venueId, def.id)] as const;
        } catch {
          // Unknown status — the post-click check still guards it.
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, RewardCreationContextDTO> = {};
      for (const result of results) {
        if (result) next[result[0]] = result[1];
      }
      setDefinitionContexts(next);
      setDefinitionContextsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [step, venueId, fetchContext]);

  // ── Terms rules, all derived from the venue's real schedule ─────────────────
  const facts = useMemo(
    () => summarizeRewardSchedules(context?.scheduleShapes ?? EMPTY_SHAPES),
    [context],
  );
  const allowedPeriods = useMemo(
    () => allowedPeriodsFor(facts, winCondition),
    [facts, winCondition],
  );
  const lockedQuantity = useMemo(
    () => lockedQuantityFor(facts, winCondition, period),
    [facts, winCondition, period],
  );
  const effectiveQuantity = lockedQuantity ?? quantity;
  const isGameWinner = winCondition === "game_winner";
  // A venue with only a one-off game has no period to offer — the sentence
  // collapses to "at my next Live Trivia game".
  const isOneOffOnly = facts.isOneOffOnly;

  const isNFLDefinition = definition?.id === NFL_PICKEM_DEFINITION_ID;
  const nflSeason = context?.nflSeason ?? null;

  // The partner only ever picks the SHAPE ("weekly" vs "season") — the season
  // number and starting week are read back from the server's own context, never
  // authored by the client (a stale/backdated fromWeek would let a partner mint
  // prizes for weeks that already played; see lib/rewards.ts).
  const nflScope: NFLRewardWeekScope | null = useMemo(() => {
    if (!isNFLDefinition || !nflSeason) return null;
    return nflScopeKind === "weekly"
      ? { kind: "weekly", season: nflSeason.season }
      : { kind: "season", season: nflSeason.season, fromWeek: nflSeason.fromWeek };
  }, [isNFLDefinition, nflSeason, nflScopeKind]);

  // The engine mapping — cadence/quota/activeDays/dates — mirrors what the
  // server re-derives in createReward. Computed here only to gate the "Next"
  // button and to send a sane cadence/winnerQuota; the server recomputes its
  // own copy from its own dates and never trusts these values.
  const nflTermsResult = useMemo(() => {
    if (!isNFLDefinition || !nflScope) return null;
    return deriveNFLWeekScopeTerms(nflScope, {
      winCondition,
      // A week winner is always exactly 1 — there's no quantity control to read.
      quantity: isGameWinner ? 1 : quantity,
      startDate: nflSeason?.fromWeekStartDate ?? null,
      endDate: nflSeason?.seasonEndDate ?? null,
    });
  }, [isNFLDefinition, nflScope, winCondition, isGameWinner, quantity, nflSeason]);

  // Game picker (Phase 5): flag-gated replacement for the game-winner sentence.
  // Never for NFL — it has no venue-scheduled games to pin to; its own
  // week-scope picker replaces the sentence instead.
  const useGamePicker = !isNFLDefinition && isGamePickerEnabled() && isGameWinner;
  const gameSlots = context?.gameSlots ?? EMPTY_GAME_SLOTS;
  const recurringSlots = useMemo(() => gameSlots.filter((slot) => slot.recurring), [gameSlots]);
  const oneOffSlots = useMemo(() => gameSlots.filter((slot) => !slot.recurring), [gameSlots]);
  const recurringKeySet = useMemo(() => new Set(recurringSlots.map(slotKey)), [recurringSlots]);
  const anyGameKeySet = useMemo(
    () => new Set(selectAllRecurringSlots(gameSlots).map(slotKey)),
    [gameSlots],
  );
  const isAnyGameSelected =
    selectedSlotKeys.size > 0 &&
    selectedSlotKeys.size === anyGameKeySet.size &&
    Array.from(selectedSlotKeys).every((key) => anyGameKeySet.has(key));
  const selectedSlots = useMemo(
    () => gameSlots.filter((slot) => selectedSlotKeys.has(slotKey(slot))),
    [gameSlots, selectedSlotKeys],
  );
  const gameWinnerTerms = useMemo(() => deriveGameWinnerTerms(selectedSlots), [selectedSlots]);

  // A stale selection from a different venue/definition/schedule fetch — or from
  // the partner switching win conditions — must not silently carry forward.
  useEffect(() => {
    setSelectedSlotKeys(new Set());
  }, [context, isGameWinner]);

  const toggleGameSlot = (slot: RewardGameSlot) => {
    const key = slotKey(slot);
    setSelectedSlotKeys((prev) => {
      if (slot.recurring) {
        // Recurring and one-off are mutually exclusive (deriveGameWinnerTerms
        // refuses a mix), so picking a recurring slot drops any one-off pick.
        const next = new Set(Array.from(prev).filter((k) => recurringKeySet.has(k)));
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      // One-off games: only one at a time.
      return prev.has(key) && prev.size === 1 ? new Set<string>() : new Set([key]);
    });
  };

  const toggleAnyGame = () => {
    setSelectedSlotKeys(isAnyGameSelected ? new Set<string>() : new Set(anyGameKeySet));
  };

  const termsError = useMemo(
    () =>
      context
        ? validateRewardTerms(facts, { winCondition, period, quantity: effectiveQuantity })
        : null,
    [context, facts, winCondition, period, effectiveQuantity],
  );

  // Switching the win condition can invalidate the chosen period — a weekly venue
  // may offer month/year for a points target but only "week" for a game-winner
  // reward. Snap to the first period that's still on offer rather than leaving a
  // stale selection the partner can't see is stale.
  useEffect(() => {
    if (!context) return;
    if (isOneOffOnly || allowedPeriods.length === 0) {
      setPeriod(null);
      return;
    }
    setPeriod((current) =>
      current !== null && allowedPeriods.includes(current)
        ? current
        : allowedPeriods.includes("weekly")
          ? "weekly"
          : allowedPeriods[0],
    );
  }, [context, allowedPeriods, isOneOffOnly]);

  // A game-winner quantity is dictated by the schedule, so keep the partner's own
  // number in sync — it becomes theirs again the moment they switch back.
  useEffect(() => {
    if (lockedQuantity !== null) setQuantity(lockedQuantity);
  }, [lockedQuantity]);

  // When a lock lifts (e.g. switching game_winner → points target), `quantity`
  // can be left holding a locked value like 14 that isn't one of
  // REWARD_QUANTITY_OPTIONS — the <select> would render blank while still
  // submitting the stale number. Snap to the closest real option instead.
  useEffect(() => {
    if (lockedQuantity !== null) return;
    if ((REWARD_QUANTITY_OPTIONS as readonly number[]).includes(quantity)) return;
    setQuantity(
      REWARD_QUANTITY_OPTIONS.reduce((closest, option) =>
        Math.abs(option - quantity) < Math.abs(closest - quantity) ? option : closest,
      ),
    );
  }, [lockedQuantity, quantity]);

  // ── Step: definition pick → resolve schedule context ────────────────────────
  const handlePickDefinition = async (picked: RewardDefinition) => {
    const isNFLPick = picked.id === NFL_PICKEM_DEFINITION_ID;
    // requiresScheduledGame is null for the NFL definition (it gates on the NFL
    // season calendar, not anything a venue schedules), so the "not available"
    // copy — and whether a "schedule it" link even makes sense — differs.
    const unavailableMessage = isNFLPick
      ? REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE
      : REWARD_TERMS_NOT_SCHEDULED_MESSAGE;

    setDefinition(picked);
    setThreshold(picked.defaultThreshold);
    setCustomThreshold("");
    setWinCondition("points_threshold");
    setNflScopeKind("weekly");
    setContextError(null);
    setNotScheduledError(null);
    setNotScheduledIsNFL(isNFLPick);

    const cached = definitionContexts[picked.id];
    if (cached) {
      if (!cached.scheduled) {
        setNotScheduledError(unavailableMessage);
        return;
      }
      setContext(cached);
      setStep("terms");
      return;
    }

    setContext(null);
    setContextLoading(true);
    try {
      const ctx = await fetchContext(venueId, picked.id);
      setDefinitionContexts((prev) => ({ ...prev, [picked.id]: ctx }));
      if (!ctx.scheduled) {
        setNotScheduledError(unavailableMessage);
        return;
      }
      setContext(ctx);
      setStep("terms");
    } catch (err) {
      setContextError(err instanceof Error ? err.message : "Couldn't check that game's schedule.");
    } finally {
      setContextLoading(false);
    }
  };

  const effectiveThreshold = useMemo(() => {
    const custom = parseInt(customThreshold, 10);
    return Number.isFinite(custom) && custom > 0 ? custom : threshold;
  }, [customThreshold, threshold]);

  const prize: RewardPrizeInput = useMemo(() => {
    if (prizeChoice === "gift_card") {
      return { prizeKind: "gift_card", amount: Math.max(0.01, Number(giftCardAmount) || 0) };
    }
    return {
      prizeKind: "menu_item",
      menuItem,
      menuItemName: menuItem === "other" ? menuItemName.trim() : null,
      discountKind,
      discountValue: Math.max(0.01, Number(discountValue) || 0),
    };
  }, [prizeChoice, giftCardAmount, menuItem, menuItemName, discountKind, discountValue]);

  const prizeSummary = useMemo(() => {
    if (prize.prizeKind === "gift_card") return `$${prize.amount.toFixed(2)} gift card`;
    const itemLabel =
      prize.menuItem === "other"
        ? prize.menuItemName || "Item"
        : MENU_ITEM_OPTIONS.find((o) => o.value === prize.menuItem)?.label ?? prize.menuItem;
    const discountLabel = prize.discountKind === "percent" ? `${prize.discountValue}% off` : `$${prize.discountValue.toFixed(2)} off`;
    return `${discountLabel} ${itemLabel}`;
  }, [prize]);

  const handleSubmit = async () => {
    if (!definition) return;
    if (isNFLDefinition) {
      if (!nflTermsResult || !nflTermsResult.ok) {
        setSubmitError(nflTermsResult?.message ?? NFL_WEEK_SCOPE_INVALID_MESSAGE);
        return;
      }
    } else if (useGamePicker) {
      if (!gameWinnerTerms.ok) {
        setSubmitError(gameWinnerTerms.message);
        return;
      }
    } else if (termsError) {
      setSubmitError(termsError);
      return;
    }
    if (prize.prizeKind === "menu_item" && prize.menuItem === "other" && !prize.menuItemName) {
      setSubmitError("Enter a name for the menu item.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmit({
        venueId,
        definitionId: definition.id,
        cadence:
          isNFLDefinition && nflTermsResult?.ok
            ? nflTermsResult.terms.cadence
            : useGamePicker && gameWinnerTerms.ok
              ? gameWinnerTerms.terms.cadence
              : cadenceForPeriod(period),
        winCondition,
        threshold: effectiveThreshold,
        winnerQuota:
          isNFLDefinition && nflTermsResult?.ok
            ? nflTermsResult.terms.quota
            : useGamePicker && gameWinnerTerms.ok
              ? gameWinnerTerms.terms.quota
              : effectiveQuantity,
        prize,
        gameWinnerSlots:
          !isNFLDefinition && useGamePicker && gameWinnerTerms.ok
            ? selectedSlots.map((slot) => ({ scheduleId: slot.scheduleId, weekday: slot.weekday }))
            : undefined,
        // The server only honors `kind` — season/fromWeek are re-derived from
        // its own reading of nfl_pickem_weeks (see lib/rewards.ts).
        nflWeekScope: isNFLDefinition ? nflScope : undefined,
      });
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  const BackButton = ({ to, label }: { to: Step; label: string }) => (
    <button type="button" onClick={() => setStep(to)} className={s.backLink}>
      ← {label}
    </button>
  );

  const scheduleLink = (
    <a href={scheduleLinkHref} className="underline">
      Schedule Live Trivia
    </a>
  );

  return (
    <div className={s.card}>
      {step === "venue" ? (
        <div className="space-y-2">
          <p className={s.heading}>Which venue?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {venues.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVenueId(v.id);
                  setStep("definition");
                }}
                className={`${s.optionCard} ${venueId === v.id ? s.optionCardActive : ""}`}
              >
                <span className="font-bold">{v.name}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onCancel} className={s.secondaryButton}>
            Cancel
          </button>
        </div>
      ) : null}

      {step === "definition" ? (
        <div className="space-y-3">
          <p className={s.heading}>Create Reward</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REWARD_DEFINITIONS.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => void handlePickDefinition(def)}
                disabled={contextLoading || definitionContextsLoading}
                className={`${s.optionCard} ${definition?.id === def.id ? s.optionCardActive : ""} disabled:opacity-60`}
              >
                <span className="text-lg">{def.glyph}</span>
                <span className="min-w-0">
                  <span className="block font-black">{def.name}</span>
                </span>
              </button>
            ))}
          </div>
          {definitionContextsLoading || contextLoading ? (
            <p className={s.helpText}>Checking the venue&apos;s schedule…</p>
          ) : null}
          {contextError ? <div className={s.error}>{contextError}</div> : null}
          {/* Only after the partner picks a reward whose game isn't scheduled.
              The NFL message has nowhere to send a link — there's nothing the
              partner can schedule to fix it. */}
          {notScheduledError ? (
            <div className={s.block}>
              {notScheduledError}
              {notScheduledIsNFL ? null : <> {scheduleLink}.</>}
            </div>
          ) : null}
          <button type="button" onClick={onCancel} className={s.secondaryButton}>
            Cancel
          </button>
        </div>
      ) : null}

      {step === "terms" && definition && context ? (
        <div className="space-y-4">
          <BackButton to="definition" label={definition.name} />

          {/* 1. The question that decides everything below it. */}
          {definition.supportsGameWinner ? (
            <div>
              <p className={s.label}>How is this reward won?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWinCondition("points_threshold")}
                  className={`${s.chip} ${!isGameWinner ? s.chipActive : ""}`}
                >
                  Points target
                </button>
                <button
                  type="button"
                  onClick={() => setWinCondition("game_winner")}
                  className={`${s.chip} ${isGameWinner ? s.chipActive : ""}`}
                >
                  {isNFLDefinition ? "Most picks right" : "Winner of the game"}
                </button>
              </div>
              <p className={`mt-1.5 ${s.helpText}`}>
                {isNFLDefinition
                  ? isGameWinner
                    ? "The guest with the most correct picks wins."
                    : "Guests win by getting a set number of picks right."
                  : isGameWinner
                    ? "Whoever wins the Live Trivia game gets this prize, whatever their score."
                    : "Anyone who reaches the points target gets this prize."}
              </p>
            </div>
          ) : null}

          {/* 2. Points target — only meaningful when that's how it's won. NFL
              renders its own copy of this below the week-scope picker (§3),
              matching the phase doc's win-condition → scope → target order. */}
          {isGameWinner || isNFLDefinition ? null : (
            <div>
              <p className={s.label}>Points target</p>
              <div className="grid grid-cols-4 gap-2">
                {definition.thresholdOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setThreshold(opt);
                      setCustomThreshold("");
                    }}
                    className={`${s.chip} ${!customThreshold && threshold === opt ? s.chipActive : ""}`}
                  >
                    {opt.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                placeholder="Custom target"
                value={customThreshold}
                onChange={(e) => {
                  setCustomThreshold(e.target.value);
                  setThresholdError(null);
                }}
                className={`mt-2 ${s.input}`}
              />
              <p className={`mt-1.5 ${s.helpText}`}>{renderRewardRequirement(definition, effectiveThreshold)}</p>
              {thresholdError ? <div className={`mt-1.5 ${s.error}`}>{thresholdError}</div> : null}
            </div>
          )}

          {/* 3. The contract — the NFL week-scope picker, the game picker
              (Phase 5, flag-gated), or the period-based sentence the game
              picker replaces for game-winner rewards. */}
          {isNFLDefinition ? (
            <div className="space-y-4">
              {nflSeason ? (
                <div>
                  <p className={s.label}>How long it runs</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setNflScopeKind("weekly")}
                      className={`${s.optionCard} ${nflScopeKind === "weekly" ? s.optionCardActive : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-black">Every week</span>
                        <span className={`block ${s.helpText}`}>
                          A new contest every NFL week. {nflSeason.weeksRemaining}{" "}
                          {nflSeason.weeksRemaining === 1 ? "week" : "weeks"} left this season.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNflScopeKind("season")}
                      className={`${s.optionCard} ${nflScopeKind === "season" ? s.optionCardActive : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-black">Whole season</span>
                        <span className={`block ${s.helpText}`}>
                          One contest, decided at the end of the season. Runs Week {nflSeason.fromWeek}{" "}
                          through the end of the season.
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {isGameWinner ? (
                <div>
                  <p className={s.label}>Winners</p>
                  <p className={s.sentence}>
                    1 winner {nflScopeKind === "weekly" ? "per week" : "for the season"}.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className={s.label}>Points target</p>
                    <div className="grid grid-cols-4 gap-2">
                      {definition.thresholdOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setThreshold(opt);
                            setCustomThreshold("");
                          }}
                          className={`${s.chip} ${!customThreshold && threshold === opt ? s.chipActive : ""}`}
                        >
                          {opt.toLocaleString("en-US")}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      placeholder="Custom target"
                      value={customThreshold}
                      onChange={(e) => {
                        setCustomThreshold(e.target.value);
                        setThresholdError(null);
                      }}
                      className={`mt-2 ${s.input}`}
                    />
                    <p className={`mt-1.5 ${s.helpText}`}>
                      {renderRewardRequirement(definition, effectiveThreshold)}
                    </p>
                    {thresholdError ? <div className={`mt-1.5 ${s.error}`}>{thresholdError}</div> : null}
                  </div>
                  <div>
                    <p className={s.label}>How many winners?</p>
                    <select
                      aria-label="Number of winners"
                      value={String(quantity)}
                      onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                      className={s.inlineSelect}
                    >
                      {REWARD_QUANTITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Style as a rule, not a disabled-state warning — see
                  docs/nfl-pickem-reward-phase5.md. */}
              {isGameWinner ? (
                <div className={s.notice}>
                  <strong>At least {NFL_REWARD_MIN_PICKERS} guests must make picks</strong> at your venue
                  that {nflScopeKind === "weekly" ? "week" : "season"} for a winner to be crowned. If fewer
                  than {NFL_REWARD_MIN_PICKERS} play, no reward is given out.
                </div>
              ) : null}

              {nflTermsResult && !nflTermsResult.ok ? (
                <div className={s.error}>{nflTermsResult.message}</div>
              ) : null}
            </div>
          ) : useGamePicker ? (
            <div>
              <p className={s.label}>Which games?</p>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={isAnyGameSelected}
                  onChange={toggleAnyGame}
                  className="h-4 w-4"
                />
                Offer this reward to the winner of any Live Trivia game
              </label>

              {recurringSlots.length === 0 && oneOffSlots.length === 0 ? (
                <div className={`mt-2 ${s.block}`}>
                  You don&apos;t have any Live Trivia games scheduled. {scheduleLink} to pick
                  games for this reward.
                </div>
              ) : null}

              {recurringSlots.length > 0 ? (
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {REWARD_WEEKDAY_KEYS.map((day) => {
                    const daySlots = recurringSlots.filter((slot) => slot.weekday === day);
                    return (
                      <div key={day} className="space-y-1 text-center">
                        <p className={`${s.helpText} uppercase`}>{day}</p>
                        {daySlots.map((slot) => (
                          <button
                            key={slotKey(slot)}
                            type="button"
                            onClick={() => toggleGameSlot(slot)}
                            className={`${s.chip} block w-full ${selectedSlotKeys.has(slotKey(slot)) ? s.chipActive : ""}`}
                          >
                            {slot.timeLabel}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {oneOffSlots.length > 0 ? (
                <div className="mt-2 space-y-2">
                  <p className={s.helpText}>One-off game{oneOffSlots.length > 1 ? "s" : ""}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {oneOffSlots.map((slot) => (
                      <button
                        key={slotKey(slot)}
                        type="button"
                        onClick={() => toggleGameSlot(slot)}
                        className={`${s.chip} text-left ${selectedSlotKeys.has(slotKey(slot)) ? s.chipActive : ""}`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {gameWinnerTerms.ok ? (
                <p className={`mt-2 ${s.helpText}`}>{describeGameWinnerSlots(selectedSlots)}</p>
              ) : (
                <div className={`mt-2 ${s.error}`}>{gameWinnerTerms.message}</div>
              )}
            </div>
          ) : (
            <div>
              <p className={s.label}>How many, how often?</p>
              {/* Explicit {" "} between the words and the controls: JSX strips the
                  whitespace around an expression that sits on its own line, so
                  without them the sentence reads "give out1of these rewards".
                  Points-target rewards use "make ... available" — a promotion the
                  partner is offering, not something being given away — while
                  game-winner keeps "give out" here (this branch only renders when
                  the game picker flag is off; see
                  docs/rewards-game-winner-picker-plan.md). */}
              <p className={s.sentence}>
                {isGameWinner ? "I want to give out" : "I want to make"}{" "}
                {lockedQuantity !== null ? (
                  <span className={s.inlineLocked}>{lockedQuantity}</span>
                ) : (
                  <select
                    aria-label="Number of rewards"
                    value={String(quantity)}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                    className={s.inlineSelect}
                  >
                    {REWARD_QUANTITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}{" "}
                {isOneOffOnly || allowedPeriods.length === 0 ? (
                  <span>
                    {isGameWinner
                      ? "of these rewards at my next Live Trivia game."
                      : "of these rewards available at my next Live Trivia game."}
                  </span>
                ) : (
                  <>
                    {isGameWinner ? "of these rewards every" : "of these rewards available every"}{" "}
                    <select
                      aria-label="How often"
                      value={period ?? allowedPeriods[0]}
                      onChange={(e) => setPeriod(e.target.value as RewardPeriod)}
                      className={s.inlineSelect}
                    >
                      {allowedPeriods.map((option) => (
                        <option key={option} value={option}>
                          {REWARD_PERIOD_NOUN[option]}
                        </option>
                      ))}
                    </select>
                    {"."}
                  </>
                )}
              </p>

              {isOneOffOnly ? (
                <div className={`mt-2 ${s.block}`}>
                  You only have a single Live Trivia game scheduled. {scheduleLink} on a
                  repeating schedule to offer a recurring reward.
                </div>
              ) : allowedPeriods.length === 0 ? (
                // Recurring games, but no period holds a FIXED number of them (e.g. a
                // weekly schedule plus a monthly one). A game-winner reward's count is
                // locked to the game count, so there's nothing honest to offer here.
                <div className={`mt-2 ${s.block}`}>
                  Your Live Trivia schedule doesn&apos;t run the same number of games in any
                  fixed period, so a &quot;winner of the game&quot; reward can only be offered
                  at your next game. Use a points target instead to offer it on a repeating
                  schedule.
                </div>
              ) : null}

              {lockedQuantity !== null && !isOneOffOnly && period ? (
                <p className={`mt-1.5 ${s.helpText}`}>
                  Each Live Trivia game has one winner, so this is set by how many games you
                  run each {REWARD_PERIOD_NOUN[period]}.
                </p>
              ) : null}

              {/* Terms messages already say what to do ("Schedule more Live Trivia
                  games to offer more"), so only the ones that are actually about
                  scheduling get the link appended. */}
              {termsError ? (
                <div className={`mt-2 ${s.error}`}>
                  {termsError}
                  {termsError.includes("Schedule") ? <> {scheduleLink}.</> : null}
                </div>
              ) : null}
            </div>
          )}

          <button
            type="button"
            disabled={
              isNFLDefinition
                ? !(nflTermsResult?.ok ?? false)
                : useGamePicker
                  ? !gameWinnerTerms.ok
                  : Boolean(termsError)
            }
            onClick={() => {
              if (!isGameWinner) {
                // The step is the definition's, not a fixed 10: Live Trivia
                // targets are points (step 10), NFL targets are correct picks
                // (step 1). Same rule the server re-checks in createReward.
                const custom = parseInt(customThreshold, 10);
                if (
                  customThreshold.trim() &&
                  Number.isFinite(custom) &&
                  !isValidRewardThreshold(custom, definition)
                ) {
                  setThresholdError(rewardThresholdStepMessage(definition));
                  return;
                }
              }
              setThresholdError(null);
              setStep("prize");
            }}
            className={s.primaryButton}
          >
            Next: Offer a Prize
          </button>
        </div>
      ) : null}

      {step === "prize" && definition ? (
        <div className="space-y-4">
          <BackButton to="terms" label="Back" />
          <p className={s.heading}>Prize</p>

          <div className="grid grid-cols-2 gap-2">
            {(["menu_item", "gift_card"] as PrizeChoice[]).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setPrizeChoice(choice)}
                className={`${s.chip} ${prizeChoice === choice ? s.chipActive : ""}`}
              >
                {choice === "menu_item" ? "Menu Item" : "Gift Card"}
              </button>
            ))}
          </div>

          {prizeChoice === "menu_item" ? (
            <div className="space-y-3">
              <div>
                <p className={s.label}>Item</p>
                <div className="grid grid-cols-3 gap-2">
                  {MENU_ITEM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMenuItem(opt.value)}
                      className={`${s.chip} ${menuItem === opt.value ? s.chipActive : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {menuItem === "other" ? (
                <div>
                  <label className={s.label}>Item name</label>
                  <input
                    type="text"
                    value={menuItemName}
                    onChange={(e) => setMenuItemName(e.target.value)}
                    placeholder="e.g. Loaded Nachos"
                    className={s.input}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountKind("percent")}
                  className={`${s.chip} ${discountKind === "percent" ? s.chipActive : ""}`}
                >
                  Percentage off
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountKind("dollar")}
                  className={`${s.chip} ${discountKind === "dollar" ? s.chipActive : ""}`}
                >
                  Dollar amount off
                </button>
              </div>
              <div>
                <label className={s.label}>{discountKind === "percent" ? "Percent off" : "Dollar amount off"}</label>
                <input
                  type="number"
                  min={0.01}
                  max={discountKind === "percent" ? 100 : undefined}
                  step={discountKind === "percent" ? 1 : 0.01}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className={s.input}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className={s.label}>Gift card amount ($)</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={giftCardAmount}
                onChange={(e) => setGiftCardAmount(e.target.value)}
                className={s.input}
              />
            </div>
          )}

          <button type="button" onClick={() => setStep("confirm")} className={s.primaryButton}>
            Next: Confirm
          </button>
        </div>
      ) : null}

      {step === "confirm" && definition ? (
        <div className="space-y-4">
          <BackButton to="prize" label="Back" />
          <p className={s.heading}>Confirm</p>

          <div>
            <div className={s.summaryRow}>
              <span>Reward</span>
              <span className="font-bold">{definition.name}</span>
            </div>
            <div className={s.summaryRow}>
              <span>Requirement</span>
              <span className="font-bold">{renderRewardRequirement(definition, effectiveThreshold, winCondition)}</span>
            </div>
            <div className={s.summaryRow}>
              <span>Prize</span>
              <span className="font-bold">{prizeSummary}</span>
            </div>
          </div>

          {/* The terms the partner just agreed to, restated verbatim. */}
          <p className={s.sentence}>
            {isNFLDefinition
              ? describeNFLWeekScope(nflScope, winCondition, { quantity, threshold: effectiveThreshold })
              : useGamePicker && gameWinnerTerms.ok
                ? describeGameWinnerSlots(selectedSlots)
                : renderTermsSentence(effectiveQuantity, period, winCondition)}
          </p>

          {/* The 3-player rule stays visible through to the moment of creation,
              not just while shopping the terms step. */}
          {isNFLDefinition && isGameWinner ? (
            <div className={s.notice}>
              <strong>At least {NFL_REWARD_MIN_PICKERS} guests must make picks</strong> at your venue that{" "}
              {nflScopeKind === "weekly" ? "week" : "season"} for a winner to be crowned. If fewer than{" "}
              {NFL_REWARD_MIN_PICKERS} play, no reward is given out.
            </div>
          ) : null}

          {submitError ? <div className={s.error}>{submitError}</div> : null}

          <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className={s.primaryButton}>
            {submitting ? "Creating…" : "Create Reward"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
