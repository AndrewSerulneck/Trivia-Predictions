"use client";

// Shared Create Reward wizard (Rewards Phase 5) — ONE component that drives the
// canonical linear flow from docs/rewards-system-plan.md §2 (definition → cadence
// → prize → quantity → confirm), used by BOTH the admin Rewards section
// (components/admin/sections/ChallengesSection.tsx) and the Partner Dashboard
// Rewards page (app/owner/competitions/page.tsx). It replaces the admin raw-field
// create form and the owner CompetitionForm template gallery per decision #1.
//
// This component owns the step flow, validation, and prize-shape branching. It
// does NOT know about /api/admin vs /api/owner/rewards — the host page supplies
// `fetchContext` (resolveRewardCreationContext over its own auth) and `onSubmit`
// (POSTs to its own route). The two hosts have different visual systems (admin =
// plain slate/white Tailwind, owner/Partner Dashboard = dark ht-* design tokens),
// so `variant` swaps a small class-token map rather than forking the component.

import { useEffect, useMemo, useState } from "react";
import {
  REWARD_DEFINITIONS,
  renderRewardRequirement,
  type RewardDefinition,
} from "@/lib/rewardDefinitions";
import type { RewardPrizeInput } from "@/lib/rewards";
import type { CampaignRecurringType, ChallengeWinCondition, RewardDiscountKind, RewardMenuItem } from "@/types";

export type RewardCreationContextDTO = {
  scheduled: boolean;
  hasRecurringSchedule: boolean;
  scheduleDays: string[];
  timezone: string | null;
  allowedCadences: CampaignRecurringType[];
};

export type CreateRewardSubmission = {
  venueId: string;
  definitionId: string;
  cadence: CampaignRecurringType;
  winCondition: ChallengeWinCondition;
  threshold: number;
  winnerQuota: number;
  prize: RewardPrizeInput;
};

export type CreateRewardWizardVenue = { id: string; name: string };

type CreateRewardWizardProps = {
  variant: "admin" | "owner";
  venues: CreateRewardWizardVenue[];
  /** Pre-selected venue (e.g. the host page's own venue filter). Skips the venue step when it's the only option. */
  defaultVenueId?: string;
  /** Where the "schedule it first" block sends the user. */
  scheduleLinkHref: string;
  fetchContext: (venueId: string, definitionId: string) => Promise<RewardCreationContextDTO>;
  onSubmit: (submission: CreateRewardSubmission) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreated: () => void;
  onCancel: () => void;
};

const MENU_ITEM_OPTIONS: Array<{ value: RewardMenuItem; label: string }> = [
  { value: "whole_order", label: "Whole Order" },
  { value: "appetizer", label: "Appetizer" },
  { value: "entree", label: "Entrée" },
  { value: "dessert", label: "Dessert" },
  { value: "wine_bottle", label: "Bottle of Wine" },
  { value: "other", label: "Other" },
];

const CADENCE_LABEL: Record<string, string> = {
  none: "Single Game",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

type Styles = {
  card: string;
  heading: string;
  backLink: string;
  label: string;
  input: string;
  helpText: string;
  optionCard: string;
  optionCardActive: string;
  chip: string;
  chipActive: string;
  primaryButton: string;
  secondaryButton: string;
  error: string;
  block: string;
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
    summaryRow: "flex items-center justify-between border-b border-slate-100 py-2 text-sm",
  },
  owner: {
    card: "space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card",
    heading: "text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300",
    backLink: "text-sm font-bold text-ht-cyan-300",
    label: "mb-1 block text-xs font-semibold text-ht-muted",
    input:
      "w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400",
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
    summaryRow: "flex items-center justify-between border-b border-ht-hairline/60 py-2 text-sm",
  },
};

type Step = "venue" | "definition" | "cadence" | "prize" | "quantity" | "confirm";
type PrizeChoice = "menu_item" | "gift_card";

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

  const [cadence, setCadence] = useState<CampaignRecurringType>("none");
  const [cadenceError, setCadenceError] = useState<string | null>(null);
  const [winCondition, setWinCondition] = useState<ChallengeWinCondition>("points_threshold");
  const [threshold, setThreshold] = useState<number>(0);
  const [customThreshold, setCustomThreshold] = useState("");
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>("menu_item");
  const [menuItem, setMenuItem] = useState<RewardMenuItem>("appetizer");
  const [menuItemName, setMenuItemName] = useState("");
  const [discountKind, setDiscountKind] = useState<RewardDiscountKind>("percent");
  const [discountValue, setDiscountValue] = useState("50");
  const [giftCardAmount, setGiftCardAmount] = useState("25");

  const [winnerQuota, setWinnerQuota] = useState("1");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const needsVenueStep = venues.length > 1 && !defaultVenueId;
  const [step, setStep] = useState<Step>(needsVenueStep ? "venue" : "definition");

  // ── Step: definition pick → resolve schedule/cadence context ────────────────
  const handlePickDefinition = async (picked: RewardDefinition) => {
    setDefinition(picked);
    setThreshold(picked.defaultThreshold);
    setCustomThreshold("");
    setWinCondition("points_threshold");
    setContext(null);
    setContextError(null);
    setContextLoading(true);
    try {
      const ctx = await fetchContext(venueId, picked.id);
      setContext(ctx);
      setCadence(ctx.allowedCadences.includes("weekly") ? "weekly" : "none");
      setStep("cadence");
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

  const cadenceOptions = context?.allowedCadences ?? [];
  const isRecurring = cadence !== "none";
  const isGameWinner = winCondition === "game_winner";

  const handleSubmit = async () => {
    if (!definition) return;
    let quota = 1;
    if (!isGameWinner) {
      quota = parseInt(winnerQuota, 10);
      if (!Number.isFinite(quota) || quota < 1) {
        setSubmitError("Enter how many of this prize are available.");
        return;
      }
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
        cadence,
        winCondition,
        threshold: effectiveThreshold,
        winnerQuota: quota,
        prize,
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
                disabled={contextLoading}
                className={`${s.optionCard} ${definition?.id === def.id ? s.optionCardActive : ""} disabled:opacity-60`}
              >
                <span className="text-lg">{def.glyph}</span>
                <span className="min-w-0">
                  <span className="block font-black">{def.name}</span>
                </span>
              </button>
            ))}
          </div>
          {contextLoading ? <p className={s.helpText}>Checking the venue&apos;s schedule…</p> : null}
          {contextError ? <div className={s.error}>{contextError}</div> : null}
          {context && definition && !context.scheduled ? (
            <div className={s.block}>
              This reward needs Live Trivia scheduled at this venue first.{" "}
              <a href={scheduleLinkHref} className="underline">
                Schedule Live Trivia
              </a>
              .
            </div>
          ) : null}
          <button type="button" onClick={onCancel} className={s.secondaryButton}>
            Cancel
          </button>
        </div>
      ) : null}

      {step === "cadence" && definition && context ? (
        <div className="space-y-4">
          <BackButton to="definition" label={definition.name} />

          <div>
            <p className={s.label}>Competition</p>
            <div className="grid grid-cols-2 gap-2">
              {(["none", "weekly"] as CampaignRecurringType[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    if (c !== "none" && !cadenceOptions.includes(c)) {
                      setCadenceError(
                        "You must schedule recurring Live Trivia games to offer a recurring Live Trivia reward.",
                      );
                      return;
                    }
                    setCadenceError(null);
                    setCadence(c);
                  }}
                  className={`${s.chip} ${cadence === c ? s.chipActive : ""}`}
                >
                  {c === "none" ? "Single Game" : "Recurring"}
                </button>
              ))}
            </div>
            <p className={`mt-1.5 ${s.helpText}`}>
              {isRecurring
                ? "Winners are counted fresh each week — a prior winner can win again next cycle."
                : "Runs once until the prize quota is filled."}
            </p>
            {cadenceError ? (
              <div className={`mt-1.5 ${s.error}`}>
                {cadenceError} <a href={scheduleLinkHref} className="underline">Schedule Live Trivia</a>.
              </div>
            ) : null}
          </div>

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
                  Winner of the game
                </button>
              </div>
              <p className={`mt-1.5 ${s.helpText}`}>
                {isGameWinner
                  ? "Only whoever wins the Live Trivia game gets this prize — there's exactly one winner, so no quantity to set."
                  : "Anyone who reaches the points target gets this prize, up to the quantity you set next."}
              </p>
            </div>
          ) : null}

          {isGameWinner ? null : (
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

          <button
            type="button"
            onClick={() => {
              if (!isGameWinner) {
                const custom = parseInt(customThreshold, 10);
                if (customThreshold.trim() && Number.isFinite(custom) && custom % 10 !== 0) {
                  setThresholdError("Custom target must be a multiple of 10.");
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
          <BackButton to="cadence" label="Back" />
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

          <button
            type="button"
            onClick={() => setStep(isGameWinner ? "confirm" : "quantity")}
            className={s.primaryButton}
          >
            {isGameWinner ? "Next: Confirm" : "Next: Quantity"}
          </button>
        </div>
      ) : null}

      {step === "quantity" && definition && !isGameWinner ? (
        <div className="space-y-4">
          <BackButton to="prize" label="Back" />
          <p className={s.heading}>Quantity</p>
          <div>
            <label className={s.label}>
              How many of these rewards do you want to make available{isRecurring ? " each cycle" : ""}?
            </label>
            <input
              type="number"
              min={1}
              value={winnerQuota}
              onChange={(e) => setWinnerQuota(e.target.value)}
              className={s.input}
            />
          </div>
          <button type="button" onClick={() => setStep("confirm")} className={s.primaryButton}>
            Next: Confirm
          </button>
        </div>
      ) : null}

      {step === "confirm" && definition ? (
        <div className="space-y-4">
          <BackButton to={isGameWinner ? "prize" : "quantity"} label="Back" />
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
              <span>Cadence</span>
              <span className="font-bold">{CADENCE_LABEL[cadence] ?? cadence}</span>
            </div>
            <div className={s.summaryRow}>
              <span>Prize</span>
              <span className="font-bold">{prizeSummary}</span>
            </div>
            {isGameWinner ? null : (
              <div className={s.summaryRow}>
                <span>Rewards available {isRecurring ? "per cycle" : "total"}</span>
                <span className="font-bold">{winnerQuota}</span>
              </div>
            )}
          </div>

          {submitError ? <div className={s.error}>{submitError}</div> : null}

          <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className={s.primaryButton}>
            {submitting ? "Creating…" : "Create Reward"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
