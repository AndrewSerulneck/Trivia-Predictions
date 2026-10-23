// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { shareTagNudge, shareWinHeadline } from "@/lib/socialShare/copyPresets";
import { buildShareDesignSpec, STORY_SHARE_SIZE_ORDER, type StoryShareDesign } from "@/lib/socialShare/shareDesigns";
import { STORY_SHARE_GAME_TYPES } from "@/lib/socialShare/shareGames";
import { applyShareVenue, readShareVenue, rememberShareVenue, toShareVenue, type ShareVenue } from "@/lib/socialShare/shareVenue";
import { buildPrizeStorySharePayload, buildStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";
import {
  DEFAULT_VENUE_SHARE_DETAILS,
  parseInstagramHandle,
  shareDetailsSummary,
} from "@/lib/venueShareDetails";
import type { Venue } from "@/types";

// docs/native-app-store-plan.md Phase 9e: the venue's Instagram handle + the partner's choice of
// what a share shows (name / address / handle — all, none or any mix), ONE choice per venue
// (Andrew, 2026-10-22), applied to every game and prize — including ones added later.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const stripComments = (code: string) => code.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

const DESIGNS: StoryShareDesign[] = ["spotlight", "card", "night", "selfie"];
const ADDRESS = { street: "1010 Pacific St", locality: "Brooklyn, NY" };

const venue = (show: ShareVenue["show"], instagram: string | null = "thepourhouse"): ShareVenue => ({
  id: "v1",
  name: "The Pour House",
  address: ADDRESS,
  instagram,
  show,
});

const gamePayload = (gameType = STORY_SHARE_GAME_TYPES[0]): StorySharePayload =>
  buildStorySharePayload(gameType, {
    venueId: "v1",
    venueName: "The Pour House",
    userId: "u1",
    username: "ace",
    finalRank: 1,
    finalPoints: 120,
  });

const prizePayload = (): StorySharePayload =>
  buildPrizeStorySharePayload({
    venueId: "v1",
    venueName: "The Pour House",
    userId: "u1",
    username: "ace",
    prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" },
  });

/** Every text a share carries: the picture (all designs × sizes), the caption, the modal titles. */
const everyText = (payload: StorySharePayload): string[] => {
  const prepared = prepareStorySharePayload(payload);
  const pictures = STORY_SHARE_SIZE_ORDER.flatMap((size) =>
    DESIGNS.flatMap((design) => buildShareDesignSpec(prepared, design, size).textBlocks.map((block) => block.text)),
  );
  return [...pictures, prepared.shareText, prepared.winLine, prepared.headline, prepared.subheadline];
};

describe("Instagram handle input", () => {
  it.each([
    ["@thepourhouse", "thepourhouse"],
    ["thepourhouse", "thepourhouse"],
    ["  The.Pour_House  ", "The.Pour_House"],
    ["https://www.instagram.com/thepourhouse/", "thepourhouse"],
    ["instagram.com/thepourhouse?igsh=abc", "thepourhouse"],
    ["http://m.instagram.com/thepourhouse", "thepourhouse"],
    ["", null],
    ["   ", null],
  ])("%j → %j", (input, handle) => {
    expect(parseInstagramHandle(input)).toEqual({ ok: true, handle });
  });

  it.each([
    "@the pour house",
    "pour-house",
    "@@thepourhouse",
    "a".repeat(31),
    "https://instagram.com/p/C0ffee",
    "https://facebook.com/thepourhouse",
    "thepourhouse!",
  ])("refuses %j with a plain message", (input) => {
    const result = parseInstagramHandle(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Instagram handle/);
  });

  it("matches the database CHECK", () => {
    const sql = read("supabase/migrations/20261023011500_venue_share_details.sql");
    expect(sql).toContain("instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'");
    expect(read("lib/venueShareDetails.ts")).toContain("/^[A-Za-z0-9._]{1,30}$/");
  });
});

describe("the choice → headline, caption and picture (all 8 combinations)", () => {
  const combos = [true, false].flatMap((name) =>
    [true, false].flatMap((address) => [true, false].map((instagram) => ({ name, address, instagram }))),
  );

  it.each(combos)("name %o", (show) => {
    for (const base of [gamePayload(), prizePayload()]) {
      const payload = applyShareVenue(base, venue(show));
      const prepared = prepareStorySharePayload(payload);
      const texts = everyText(payload);
      const label = JSON.stringify(show);

      expect(prepared.winLine.includes(" at The Pour House"), label).toBe(show.name);
      expect(texts.some((text) => text.includes("The Pour House") || text.includes("THE POUR HOUSE")), label).toBe(show.name);
      expect(texts.includes("1010 Pacific St"), label).toBe(show.address);
      expect(texts.includes("Brooklyn, NY"), label).toBe(show.address);
      expect(texts.includes("@thepourhouse"), `${label} picture`).toBe(show.instagram);
      expect(prepared.shareText.includes(" @thepourhouse "), `${label} caption`).toBe(show.instagram);
      // The app link and headline are always there.
      expect(prepared.shareText).toMatch(/Play on Hightop Challenge: https:\/\/hightopchallenge\.com\/app$/);

      const nudge = shareTagNudge(payload.venueName, payload.venueInstagram);
      expect(nudge, label).toBe(
        show.instagram ? "Tag @thepourhouse in your post" : show.name ? "Tag The Pour House in your post" : null,
      );
    }
  });

  it("Andrew's caption order: headline, @handle, then the app link", () => {
    const payload = applyShareVenue(prizePayload(), venue({ name: true, address: true, instagram: true }));
    expect(prepareStorySharePayload(payload).shareText).toBe(
      "I just won $15 off my tab at The Pour House! @thepourhouse Play on Hightop Challenge: https://hightopchallenge.com/app",
    );
    const nameOff = applyShareVenue(prizePayload(), venue({ name: false, address: false, instagram: false }));
    expect(shareWinHeadline(nameOff)).toBe("I just won $15 off my tab!");
  });

  it("handle switched on but none set: nothing printed, the nudge falls back to the name", () => {
    const payload = applyShareVenue(gamePayload(), venue({ name: true, address: true, instagram: true }, null));
    expect(everyText(payload).some((text) => text.includes("@thepourhouse"))).toBe(false);
    expect(shareTagNudge(payload.venueName, payload.venueInstagram)).toBe("Tag The Pour House in your post");
  });

  it("venue not known yet: the screen's payload as built (the defaults), never a handle", () => {
    const payload = applyShareVenue({ ...gamePayload(), venueInstagram: "sneaky" }, null);
    expect(payload.venueName).toBe("The Pour House");
    expect(payload.venueInstagram).toBeNull();
  });

  it("every registry game honours it — a new game gets the same treatment with no extra code", () => {
    for (const gameType of STORY_SHARE_GAME_TYPES) {
      const hidden = applyShareVenue(gamePayload(gameType), venue({ name: false, address: false, instagram: false }));
      expect(everyText(hidden).some((text) => /pour house|1010 pacific|@thepourhouse/i.test(text)), gameType).toBe(false);
      const shown = applyShareVenue(gamePayload(gameType), venue({ name: true, address: true, instagram: true }));
      const texts = everyText(shown);
      for (const expected of ["The Pour House", "1010 Pacific St", "@thepourhouse"]) {
        expect(texts.includes(expected), `${gameType} ${expected}`).toBe(true);
      }
    }
  });
});

describe("the player side reads the choice with the venue it already has (zero new requests)", () => {
  const baseVenue: Venue = { id: "v1", name: "pour", displayName: "The Pour House", latitude: 1, longitude: 1, radius: 100, street: "1010 Pacific St", city: "Brooklyn", state: "NY" };

  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("a venue row without the new columns = the defaults (today's pictures)", () => {
    expect(toShareVenue(baseVenue)).toMatchObject({
      instagram: null,
      show: { name: true, address: true, instagram: true },
    });
  });

  it("carries the choice, and remembers it under the v2 key", () => {
    rememberShareVenue({ ...baseVenue, instagramHandle: "thepourhouse", shareShowName: false, shareShowAddress: true, shareShowInstagram: true });
    expect(window.localStorage.getItem("htc_share_venue_v2")).toBeTruthy();
    expect(readShareVenue("v1")).toMatchObject({ instagram: "thepourhouse", show: { name: false, address: true, instagram: true } });
  });

  it("an old v1 entry (no choice) is never read as a choice", () => {
    window.localStorage.setItem("htc_share_venue_v1", JSON.stringify({ id: "v1", name: "The Pour House", address: null }));
    window.localStorage.setItem("htc_share_venue_v2", JSON.stringify({ id: "v1", name: "The Pour House", address: null }));
    expect(readShareVenue("v1")).toBeNull();
  });

  it("the venue reads select the columns; a database a migration behind steps down instead of failing", () => {
    const code = read("lib/venues.ts");
    expect(code).toMatch(/instagram_handle, share_show_name, share_show_address, share_show_instagram/);
    expect(code).toMatch(/VENUE_SELECT_TIERS = \[VENUE_SELECT_WITH_SHARE_DETAILS, VENUE_SELECT_WITH_PARSED_ADDRESS, VENUE_SELECT_LEGACY\]/);
  });
});

describe("one place applies the choice", () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const appCode = ["app", "components", "lib"].flatMap(sourceFiles).map((path) => ({ path, code: stripComments(read(path)) }));

  it("only StoryShareLauncher calls applyShareVenue, and every share goes through StoryShareLauncher", () => {
    const callers = appCode.filter(({ code }) => /applyShareVenue\(/.test(code)).map(({ path }) => path);
    expect(callers).toEqual(["components/social-share/StoryShareLauncher.tsx"]);
    const modalHosts = appCode.filter(({ code }) => /<StoryCaptureModal\b/.test(code)).map(({ path }) => path);
    expect(modalHosts).toEqual(["components/social-share/StoryShareLauncher.tsx"]);
  });

  it("no screen sets the handle itself", () => {
    const setters = appCode.filter(({ code }) => /venueInstagram:/.test(code)).map(({ path }) => path);
    expect(setters).toEqual(["lib/socialShare/shareVenue.ts"]);
  });
});

describe("partner side", () => {
  it("summary line", () => {
    expect(shareDetailsSummary({ ...DEFAULT_VENUE_SHARE_DETAILS })).toBe("Name and address");
    expect(shareDetailsSummary({ instagramHandle: "thepourhouse", showName: true, showAddress: true, showInstagram: true })).toBe(
      "Name, address and @thepourhouse",
    );
    expect(shareDetailsSummary({ instagramHandle: "thepourhouse", showName: false, showAddress: false, showInstagram: true })).toBe(
      "@thepourhouse",
    );
    expect(shareDetailsSummary({ instagramHandle: null, showName: false, showAddress: true, showInstagram: true })).toBe("Address");
    expect(shareDetailsSummary({ instagramHandle: "x", showName: false, showAddress: false, showInstagram: false })).toBe("Just the win");
  });

  it("the panel is asked in Schedule, Prizes (owner wizard only) and Game Settings, and on the admin venue form", () => {
    expect(read("components/owner/schedule/ScheduleGameFlow.tsx")).toMatch(/<ShareDetailsPanel venueId=\{venueId\} \/>/);
    expect(read("components/owner/rewards/RewardsFlow.tsx")).toMatch(/confirmExtra=\{<ShareDetailsPanel venueId=\{venueId\} \/>\}/);
    expect(read("app/owner/game-settings/page.tsx")).toMatch(/<ShareDetailsPanel /);
    expect(read("components/admin/sections/VenuesSection.tsx")).toMatch(/<ShareDetailsPanel venueId=\{venueId\} host="admin" tone="light" \/>/);
    // The admin Rewards host never passes it, so its Confirm markup is unchanged.
    expect(read("components/admin/sections/ChallengesSection.tsx")).not.toMatch(/confirmExtra/);
  });
});
