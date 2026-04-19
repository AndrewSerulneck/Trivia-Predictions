import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType } from "@/types";

export type AdPlacementMeta = {
  pageKey: AdPageKey;
  adType: AdType;
  displayTrigger: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
};

export function deriveSlotFromPlacement(meta: Pick<AdPlacementMeta, "adType" | "displayTrigger">): AdSlot {
  if (meta.adType === "popup") {
    return meta.displayTrigger === "on-scroll" ? "popup-on-scroll" : "popup-on-entry";
  }
  if (meta.adType === "banner") {
    return "mobile-adhesion";
  }
  return "leaderboard-sidebar";
}

export function derivePlacementFromSlot(slot: AdSlot): Pick<AdPlacementMeta, "adType" | "displayTrigger"> {
  if (slot === "popup-on-scroll") {
    return { adType: "popup", displayTrigger: "on-scroll" };
  }
  if (slot === "popup-on-entry") {
    return { adType: "popup", displayTrigger: "on-load" };
  }
  if (slot === "mobile-adhesion" || slot === "header" || slot === "sidebar" || slot === "footer") {
    return { adType: "banner", displayTrigger: "on-load" };
  }
  return { adType: "inline", displayTrigger: "on-load" };
}

export function normalizeAdPlacementMeta(input: {
  slot: AdSlot;
  pageKey?: AdPageKey;
  adType?: AdType;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
}): AdPlacementMeta {
  const fromSlot = derivePlacementFromSlot(input.slot);
  const adType = input.adType ?? fromSlot.adType;
  const displayTrigger = input.displayTrigger ?? fromSlot.displayTrigger;

  const pageKey = input.pageKey ?? (input.slot === "popup-on-entry" || input.slot === "popup-on-scroll" ? "venue" : "global");
  const placementKey = input.placementKey?.trim() || undefined;
  const parsedRound = Number.isFinite(input.roundNumber) ? Math.round(Number(input.roundNumber)) : undefined;
  const parsedSequence = Number.isFinite(input.sequenceIndex) ? Math.round(Number(input.sequenceIndex)) : undefined;

  return {
    pageKey,
    adType,
    displayTrigger,
    placementKey,
    roundNumber: parsedRound && parsedRound >= 1 && parsedRound <= 3 ? parsedRound : undefined,
    sequenceIndex: parsedSequence && parsedSequence >= 1 && parsedSequence <= 6 ? parsedSequence : undefined,
  };
}
