import type { AdPageKey, AdSlot, AdDisplayTrigger } from "@/types";

export type SlotRegistryEntry = {
  id: string;               // 3-digit string e.g. "001"
  label: string;            // human-readable name
  pageKey: AdPageKey;
  slot: AdSlot;
  trigger: AdDisplayTrigger;
  roundNumber?: number;
};

export const AD_SLOT_REGISTRY: SlotRegistryEntry[] = [
  // JOIN
  { id: "001", label: "Join Entry Pop-Up",          pageKey: "join",         slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "003", label: "Join Inline Content",         pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
  { id: "004", label: "Join Mobile Banner",          pageKey: "join",         slot: "mobile-adhesion",                trigger: "on-load"  },
  // VENUE
  { id: "010", label: "Venue Entry Pop-Up",          pageKey: "venue",        slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "011", label: "Venue Scroll Pop-Up",         pageKey: "venue",        slot: "popup-on-scroll",                trigger: "on-scroll"},
  { id: "012", label: "Venue Leaderboard Rows 1–10", pageKey: "venue",        slot: "venue-leaderboard-rows-1-10",    trigger: "on-load"  },
  { id: "013", label: "Venue Leaderboard Rows 11–20",pageKey: "venue",        slot: "venue-leaderboard-rows-11-20",   trigger: "on-load"  },
  { id: "014", label: "Venue Leaderboard Rows 21–30",pageKey: "venue",        slot: "venue-leaderboard-rows-21-30",   trigger: "on-load"  },
  { id: "015", label: "Venue Leaderboard Rows 31–40",pageKey: "venue",        slot: "venue-leaderboard-rows-31-40",   trigger: "on-load"  },
  { id: "016", label: "Venue Leaderboard Rows 41–50",pageKey: "venue",        slot: "venue-leaderboard-rows-41-50",   trigger: "on-load"  },
  { id: "017", label: "Venue Mobile Banner",         pageKey: "venue",        slot: "mobile-adhesion",                trigger: "on-load"  },
  { id: "018", label: "Venue Mobile Banner (Scroll)",pageKey: "venue",        slot: "mobile-adhesion",                trigger: "on-scroll"},
  // SPEED TRIVIA
  { id: "020", label: "Speed Trivia Entry Pop-Up",   pageKey: "speed-trivia", slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "022", label: "Speed Trivia Round 1 End",    pageKey: "speed-trivia", slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 1 },
  { id: "023", label: "Speed Trivia Round 2 End",    pageKey: "speed-trivia", slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 2 },
  { id: "024", label: "Speed Trivia Round 3 End",    pageKey: "speed-trivia", slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 3 },
  { id: "026", label: "Speed Trivia Mobile Banner",  pageKey: "speed-trivia", slot: "mobile-adhesion",                trigger: "on-load"  },
  // LIVE TRIVIA
  { id: "030", label: "Live Trivia Lobby Pop-Up",    pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "031", label: "Live Trivia R1 Intermission", pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 1 },
  { id: "032", label: "Live Trivia R2 Intermission", pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 2 },
  { id: "033", label: "Live Trivia R3 Intermission", pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 3 },
  { id: "034", label: "Live Trivia R4 Intermission", pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 4 },
  { id: "035", label: "Live Trivia R5 Intermission", pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 5 },
  { id: "036", label: "Live Trivia Lobby Inline",    pageKey: "live-trivia",  slot: "inline-content",                 trigger: "on-load"  },
  { id: "037", label: "Live Trivia Mobile Banner",   pageKey: "live-trivia",  slot: "mobile-adhesion",                trigger: "on-load"  },
  // SPORTS BINGO
  { id: "040", label: "Bingo Entry Pop-Up",          pageKey: "sports-bingo", slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "041", label: "Bingo Scroll Pop-Up",         pageKey: "sports-bingo", slot: "popup-on-scroll",                trigger: "on-scroll"},
  { id: "042", label: "Bingo Inline Content",        pageKey: "sports-bingo", slot: "inline-content",                 trigger: "on-load"  },
  { id: "043", label: "Bingo Mobile Banner",         pageKey: "sports-bingo", slot: "mobile-adhesion",                trigger: "on-load"  },
  { id: "044", label: "Bingo Mobile Banner (Scroll)",pageKey: "sports-bingo", slot: "mobile-adhesion",                trigger: "on-scroll"},
  // PICK 'EM
  { id: "050", label: "Pick 'Em Entry Pop-Up",       pageKey: "pickem",       slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "051", label: "Pick 'Em Scroll Pop-Up",      pageKey: "pickem",       slot: "popup-on-scroll",                trigger: "on-scroll"},
  { id: "052", label: "Pick 'Em Inline Content",     pageKey: "pickem",       slot: "inline-content",                 trigger: "on-load"  },
  { id: "053", label: "Pick 'Em Mobile Banner",      pageKey: "pickem",       slot: "mobile-adhesion",                trigger: "on-load"  },
  { id: "054", label: "Pick 'Em Mobile Banner (Scroll)", pageKey: "pickem",   slot: "mobile-adhesion",                trigger: "on-scroll"},
  // FANTASY
  { id: "060", label: "Fantasy Entry Pop-Up",        pageKey: "fantasy",      slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "061", label: "Fantasy Scroll Pop-Up",       pageKey: "fantasy",      slot: "popup-on-scroll",                trigger: "on-scroll"},
  { id: "062", label: "Fantasy Inline Content",      pageKey: "fantasy",      slot: "inline-content",                 trigger: "on-load"  },
  { id: "063", label: "Fantasy Mobile Banner",       pageKey: "fantasy",      slot: "mobile-adhesion",                trigger: "on-load"  },
  { id: "064", label: "Fantasy Mobile Banner (Scroll)", pageKey: "fantasy",   slot: "mobile-adhesion",                trigger: "on-scroll"},
  // INLINE REFINEMENTS
  { id: "066", label: "Bingo Inline (Under Grid)",   pageKey: "sports-bingo", slot: "inline-content",                 trigger: "on-load"  },
  { id: "067", label: "Fantasy Inline (Feed)",       pageKey: "fantasy",      slot: "inline-content",                 trigger: "on-load"  },
  { id: "068", label: "Live Trivia Inline (Lobby)",  pageKey: "live-trivia",  slot: "inline-content",                 trigger: "on-load"  },
  // PICK 'EM - 6 SPECIFIC INLINE SLOTS
  { id: "071", label: "Pick 'Em Inline (Cards 1-5)",   pageKey: "pickem",       slot: "pickem-inline-cards-1-5",        trigger: "on-load"  },
    
  D. Render confirmation animation in the "My Roster" section:
  
  Add this after the "My Roster" box, or overlay it on the button:
  { id: "072", label: "Pick 'Em Inline (Cards 6-10)",  pageKey: "pickem",       slot: "pickem-inline-cards-6-10",       trigger: "on-load"  },
  { id: "073", label: "Pick 'Em Inline (Cards 11-15)", pageKey: "pickem",       slot: "pickem-inline-cards-11-15",      trigger: "on-load"  },
  { id: "074", label: "Pick 'Em Inline (Cards 16-20)", pageKey: "pickem",       slot: "pickem-inline-cards-16-20",      trigger: "on-load"  },
  { id: "075", label: "Pick 'Em Inline (Cards 21-25)", pageKey: "pickem",       slot: "pickem-inline-cards-21-25",      trigger: "on-load"  },
  { id: "076", label: "Pick 'Em Inline (Cards 26-30)", pageKey: "pickem",       slot: "pickem-inline-cards-26-30",      trigger: "on-load"  },
  // OTHER
  { id: "077", label: "Join Inline Venue List",        pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
  // SPEED TRIVIA ROUND-END BANNERS
  { id: "078", label: "Speed Trivia Round 1 End Banner", pageKey: "speed-trivia", slot: "mobile-adhesion",              trigger: "round-end", roundNumber: 1 },
  { id: "079", label: "Speed Trivia Round 2 End Banner", pageKey: "speed-trivia", slot: "mobile-adhesion",              trigger: "round-end", roundNumber: 2 },
  { id: "080", label: "Speed Trivia Round 3 End Banner", pageKey: "speed-trivia", slot: "mobile-adhesion",              trigger: "round-end", roundNumber: 3 },
  // LIVE TRIVIA INTERMISSION POPUPS (ROUND 6-12)
  { id: "081", label: "Live Trivia R6 Intermission",   pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 6 },
  { id: "082", label: "Live Trivia R7 Intermission",   pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 7 },
  { id: "083", label: "Live Trivia R8 Intermission",   pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 8 },
  { id: "084", label: "Live Trivia R9 Intermission",   pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 9 },
  { id: "085", label: "Live Trivia R10 Intermission",  pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 10 },
  { id: "086", label: "Live Trivia R11 Intermission",  pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 11 },
  { id: "087", label: "Live Trivia R12 Intermission",  pageKey: "live-trivia",  slot: "popup-on-entry",                 trigger: "round-end", roundNumber: 12 },
  // LIVE TRIVIA INTERMISSION BANNERS (ROUND 1-12)
  { id: "088", label: "Live Trivia R1 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 1 },
  { id: "089", label: "Live Trivia R2 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 2 },
  { id: "090", label: "Live Trivia R3 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 3 },
  { id: "091", label: "Live Trivia R4 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 4 },
  { id: "092", label: "Live Trivia R5 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 5 },
  { id: "093", label: "Live Trivia R6 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 6 },
  { id: "094", label: "Live Trivia R7 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 7 },
  { id: "095", label: "Live Trivia R8 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 8 },
  { id: "096", label: "Live Trivia R9 Intermission Banner",  pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 9 },
  { id: "097", label: "Live Trivia R10 Intermission Banner", pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 10 },
  { id: "098", label: "Live Trivia R11 Intermission Banner", pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 11 },
  { id: "099", label: "Live Trivia R12 Intermission Banner", pageKey: "live-trivia", slot: "mobile-adhesion",           trigger: "round-end", roundNumber: 12 },
];

export function getInlineSlotRegistryEntries(): SlotRegistryEntry[] {
  return AD_SLOT_REGISTRY.filter(
    (e) => e.slot === "inline-content" || e.slot.includes("inline") || e.slot.startsWith("pickem-inline")
  );
}

export function getInlineSlotsByPage(pageKey: AdPageKey): SlotRegistryEntry[] {
  return AD_SLOT_REGISTRY.filter(
    (e) => e.pageKey === pageKey &&
    (e.slot === "inline-content" ||
     e.slot.startsWith("venue-leaderboard-rows-"))
  );
}

export function lookupSlotId(
  pageKey: AdPageKey,
  slot: AdSlot,
  trigger: AdDisplayTrigger,
  roundNumber?: number
): string | undefined {
  const entry = AD_SLOT_REGISTRY.find(
    (e) =>
      e.pageKey === pageKey &&
      e.slot === slot &&
      e.trigger === trigger &&
      (roundNumber !== undefined ? e.roundNumber === roundNumber : e.roundNumber === undefined)
  );
  return entry?.id;
}

export function lookupSlotLabel(id: string): string | undefined {
  return AD_SLOT_REGISTRY.find((e) => e.id === id)?.label;
}
