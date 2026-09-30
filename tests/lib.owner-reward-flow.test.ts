import { describe, expect, it } from "vitest";
import {
  OWNER_WIZARD_STEPS,
  REWARD_SLIDE_ORDER,
  removeOutcomeMessage,
  resolveRewardSheetStep,
  rewardScreenFor,
} from "@/lib/ownerRewardFlow";
import { guardRewardWizardStep, isRewardWizardStep } from "@/lib/rewardWizardSteps";
import { stepDirection } from "@/lib/ownerSheetParams";

describe("resolveRewardSheetStep", () => {
  it("shows the list when there is no step (a bare ?sheet=rewards, the old /owner/competitions redirect)", () => {
    expect(resolveRewardSheetStep({ rawStep: null, hasReward: false })).toBe("all");
    expect(resolveRewardSheetStep({ rawStep: undefined, hasReward: true })).toBe("all");
  });

  it("keeps every known screen", () => {
    for (const step of ["all", "history", "definition", "terms", "prize", "confirm"]) {
      expect(resolveRewardSheetStep({ rawStep: step, hasReward: false })).toBe(step);
    }
    for (const step of ["detail", "end"]) {
      expect(resolveRewardSheetStep({ rawStep: step, hasReward: true })).toBe(step);
    }
  });

  it("falls back to the list when a reward screen has no reward (a reload lost it)", () => {
    expect(resolveRewardSheetStep({ rawStep: "detail", hasReward: false })).toBe("all");
    expect(resolveRewardSheetStep({ rawStep: "end", hasReward: false })).toBe("all");
  });

  it("never lands owners on the venue step, and ignores junk", () => {
    expect(resolveRewardSheetStep({ rawStep: "venue", hasReward: false })).toBe("definition");
    expect(resolveRewardSheetStep({ rawStep: "nope", hasReward: true })).toBe("all");
    expect(resolveRewardSheetStep({ rawStep: "<script>", hasReward: true })).toBe("all");
  });
});

describe("reward screens", () => {
  it("maps every wizard step onto the one wizard pane", () => {
    for (const step of OWNER_WIZARD_STEPS) expect(rewardScreenFor(step)).toBe("wizard");
    expect(OWNER_WIZARD_STEPS).not.toContain("venue");
    expect(rewardScreenFor("all")).toBe("all");
    expect(rewardScreenFor("end")).toBe("end");
  });

  it("ranks every pane so the slide direction is never accidentally 'forward'", () => {
    expect(new Set(REWARD_SLIDE_ORDER).size).toBe(5);
    expect(stepDirection(REWARD_SLIDE_ORDER, "detail", "all")).toBe(-1);
    expect(stepDirection(REWARD_SLIDE_ORDER, "end", "detail")).toBe(-1);
    expect(stepDirection(REWARD_SLIDE_ORDER, "all", "wizard")).toBe(1);
    expect(stepDirection(REWARD_SLIDE_ORDER, "wizard", "all")).toBe(-1);
    expect(stepDirection(REWARD_SLIDE_ORDER, "all", "history")).toBe(1);
    expect(stepDirection(REWARD_SLIDE_ORDER, "history", "all")).toBe(-1);
  });
});

describe("guardRewardWizardStep", () => {
  const none = { definition: false, context: false };
  it("sends steps that need a picked reward back to Definition", () => {
    for (const step of ["terms", "prize", "confirm"] as const) {
      expect(guardRewardWizardStep(step, none)).toBe("definition");
      expect(guardRewardWizardStep(step, { definition: true, context: false })).toBe("definition");
      expect(guardRewardWizardStep(step, { definition: true, context: true })).toBe(step);
    }
  });

  it("leaves venue and definition alone", () => {
    expect(guardRewardWizardStep("venue", none)).toBe("venue");
    expect(guardRewardWizardStep("definition", none)).toBe("definition");
  });

  it("recognises wizard step ids", () => {
    expect(isRewardWizardStep("prize")).toBe(true);
    expect(isRewardWizardStep("detail")).toBe(false);
    expect(isRewardWizardStep(null)).toBe(false);
  });
});

describe("removeOutcomeMessage — the old page's wording, unchanged", () => {
  it("reports what the server did", () => {
    expect(removeOutcomeMessage("archived", undefined)).toBe("Reward archived. Prizes already awarded still work.");
    expect(removeOutcomeMessage(undefined, undefined)).toBe("Reward archived. Prizes already awarded still work.");
    expect(removeOutcomeMessage("deleted", 0)).toBe("Reward deleted.");
    expect(removeOutcomeMessage("deleted", undefined)).toBe("Reward deleted.");
    expect(removeOutcomeMessage("deleted", 1)).toBe("Reward deleted. 1 already-redeemed prize kept for your records.");
    expect(removeOutcomeMessage("deleted", 3)).toBe("Reward deleted. 3 already-redeemed prizes kept for your records.");
  });
});
