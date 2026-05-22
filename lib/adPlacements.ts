import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType } from "@/types";

type AdTypePlacementDefinition = {
  name: string;
  description: string;
  defaultSlot: AdSlot;
  defaultDisplayTrigger: AdDisplayTrigger;
  allowedDisplayTriggers: AdDisplayTrigger[];
};

type AdPagePlacementDefinition = {
  name: string;
  slots: Record<AdType, AdTypePlacementDefinition>;
};

const DEFAULT_SLOT_BY_AD_TYPE: Record<AdType, AdSlot> = {
  popup: "popup-on-entry",
  banner: "mobile-adhesion",
  inline: "leaderboard-sidebar",
};

/**
 * Canonical admin taxonomy: each page supports three distinct ad types.
 * This avoids "inline-banner" conflation and keeps placement behavior explicit.
 */
export const AD_PLACEMENTS: Record<Exclude<AdPageKey, "global">, AdPagePlacementDefinition> = {
  join: {
    name: "Join Page",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad shown when users enter the Join flow.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad that does not interrupt flow.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded ad inside Join content that users can scroll past.",
        defaultSlot: "inline-content",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
  venue: {
    name: "Venue Page",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad shown on venue entry/scroll breakpoints.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad on venue pages.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded ad inside venue content/leaderboards.",
        defaultSlot: "leaderboard-sidebar",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
  trivia: {
    name: "Trivia (Live + Speed)",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad for Trivia entry, scroll, or round-end moments.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll", "round-end"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad during Trivia play.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded ad in Trivia content streams and lobby surfaces.",
        defaultSlot: "leaderboard-sidebar",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
  "sports-bingo": {
    name: "Bingo Page",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad shown during Bingo session entry points.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad while users play Bingo.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded ad inline with Bingo content.",
        defaultSlot: "leaderboard-sidebar",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
  pickem: {
    name: "Pick 'Em",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad shown on Pick 'Em entry/scroll triggers.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad in Pick 'Em views.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded ad between Pick 'Em cards/content.",
        defaultSlot: "leaderboard-sidebar",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
  fantasy: {
    name: "Fantasy Page",
    slots: {
      popup: {
        name: "Pop-Up Ad",
        description: "Full-screen ad shown when users enter Fantasy.",
        defaultSlot: "popup-on-entry",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load", "on-scroll"],
      },
      banner: {
        name: "Banner Ad",
        description: "Persistent bottom-bar ad during Fantasy gameplay.",
        defaultSlot: "mobile-adhesion",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
      inline: {
        name: "Inline Ad",
        description: "Embedded in-feed Fantasy placement users can scroll past.",
        defaultSlot: "leaderboard-sidebar",
        defaultDisplayTrigger: "on-load",
        allowedDisplayTriggers: ["on-load"],
      },
    },
  },
};

export function isSlotCompatibleWithAdType(slot: AdSlot, adType: AdType): boolean {
  if (adType === "popup") {
    return slot === "popup-on-entry" || slot === "popup-on-scroll";
  }
  if (adType === "banner") {
    return slot === "mobile-adhesion" || slot === "header" || slot === "footer" || slot === "sidebar";
  }
  return slot === "leaderboard-sidebar" || slot === "inline-content" || slot === "mid-content";
}

export function getAdPlacementPage(pageKey: AdPageKey): AdPagePlacementDefinition | null {
  if (pageKey === "global") return null;
  return AD_PLACEMENTS[pageKey];
}

export function getSupportedAdTypesForPage(pageKey: AdPageKey): AdType[] {
  const page = getAdPlacementPage(pageKey);
  return page ? (Object.keys(page.slots) as AdType[]) : [];
}

export function isAdTypeSupportedForPage(pageKey: AdPageKey, adType: AdType): boolean {
  const page = getAdPlacementPage(pageKey);
  return Boolean(page?.slots[adType]);
}

export function getAllowedDisplayTriggers(pageKey: AdPageKey, adType: AdType): AdDisplayTrigger[] {
  const page = getAdPlacementPage(pageKey);
  if (!page) return [];
  return page.slots[adType].allowedDisplayTriggers;
}

export function getDefaultPlacementMeta(pageKey: AdPageKey, adType: AdType): Pick<AdPlacementMeta, "slot" | "displayTrigger"> | null {
  const page = getAdPlacementPage(pageKey);
  if (!page) return null;
  const slotConfig = page.slots[adType];
  return { slot: slotConfig.defaultSlot, displayTrigger: slotConfig.defaultDisplayTrigger };
}

export function isDisplayTriggerSupportedForPlacement(
  pageKey: AdPageKey,
  adType: AdType,
  displayTrigger: AdDisplayTrigger
): boolean {
  return getAllowedDisplayTriggers(pageKey, adType).includes(displayTrigger);
}

export type AdPlacementMeta = {
  slot: AdSlot;
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
  const compatibleSlot = isSlotCompatibleWithAdType(input.slot, adType) ? input.slot : DEFAULT_SLOT_BY_AD_TYPE[adType];
  const defaultMeta = getDefaultPlacementMeta(pageKey, adType);
  const allowedTriggers = getAllowedDisplayTriggers(pageKey, adType);
  const normalizedTrigger = allowedTriggers.includes(displayTrigger)
    ? displayTrigger
    : defaultMeta?.displayTrigger ?? fromSlot.displayTrigger;

  return {
    slot: compatibleSlot,
    pageKey,
    adType,
    displayTrigger: normalizedTrigger,
    placementKey,
    roundNumber: parsedRound && parsedRound >= 1 && parsedRound <= 24 ? parsedRound : undefined,
    sequenceIndex: parsedSequence && parsedSequence >= 1 && parsedSequence <= 50 ? parsedSequence : undefined,
  };
}
