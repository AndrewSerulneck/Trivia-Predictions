import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_PROMO_SOUND_LICENCES, PROMO_MUSIC, PROMO_SOUNDS } from "@/lib/promo/promoSounds";
import { PROMO_SYNTHS } from "@/lib/promo/promoSynth";
import { SUPPORTED_OWNER_SCHEDULE_GAME_TYPES } from "@/lib/ownerSchedule";
import { PROMO_TEMPLATES, promoGameForPrizeGameType, promoGameForSchedule } from "@/lib/promo/promoTemplates";
import { REWARD_DEFINITIONS } from "@/lib/rewardDefinitions";

// Share to social coverage (docs/partner-social-promo-plan.md D12, §9): every game a partner can
// schedule, and every game a prize can be offered for, has a design — so the "Share to social" step
// never meets a game it can't draw. Prizes ride on their game's design (D13); a new prize KIND needs
// nothing here. If this fails: add one entry to lib/promo/promoTemplates.ts.

describe("Share to social design coverage", () => {
  it("every schedulable game has a design", () => {
    const missing = SUPPORTED_OWNER_SCHEDULE_GAME_TYPES.filter((gameType) => promoGameForSchedule(gameType) === null);
    expect(missing).toEqual([]);
  });

  it("every prize definition's game has a design that shows its prizes", () => {
    const missing = REWARD_DEFINITIONS.filter((definition) => promoGameForPrizeGameType(definition.gameType) === null).map(
      (definition) => definition.id,
    );
    expect(missing).toEqual([]);
  });

  it("each game has exactly one design", () => {
    const games = PROMO_TEMPLATES.map((template) => template.game);
    expect(new Set(games).size).toBe(games.length);
  });

  it("a design without a schedule engine has a standing 'when' line", () => {
    const missing = PROMO_TEMPLATES.filter((template) => !template.scheduleGameType && !template.standingWhen).map((t) => t.game);
    expect(missing).toEqual([]);
  });

  it("designs never say Reward (wording rule)", () => {
    for (const template of PROMO_TEMPLATES) {
      expect(JSON.stringify(template)).not.toMatch(/reward/i);
    }
  });
});

// Sounds (plan §4.2, §6, D7): free libraries only, a licence record on every sound, and a Content ID
// check before a music FILE can be offered. If this fails: fix the entry in lib/promo/promoSounds.ts.
describe("Share to social sound licences", () => {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  it("every sound has an allowed licence", () => {
    const bad = PROMO_SOUNDS.filter((sound) => !ALLOWED_PROMO_SOUND_LICENCES.includes(sound.license.licence)).map((s) => s.id);
    expect(bad).toEqual([]);
  });

  it("a downloaded sound records where it came from and when", () => {
    for (const sound of PROMO_SOUNDS) {
      if (sound.license.licence === "hightop-original") {
        expect(sound.audio.kind, sound.id).toBe("synth");
        continue;
      }
      expect(sound.license.sourceUrl, sound.id).toMatch(/^https:\/\//);
      expect(sound.license.downloadedOn, sound.id).toMatch(DATE);
    }
  });

  it("a music file passed the 48-hour Content ID test (§6 step 2)", () => {
    const unchecked = PROMO_MUSIC.filter((sound) => sound.audio.kind === "file" && !DATE.test(sound.license.contentIdChecked ?? "")).map(
      (sound) => sound.id,
    );
    expect(unchecked).toEqual([]);
  });

  it("each file is served from /promo/sounds under a versioned name, and exists", () => {
    for (const sound of PROMO_SOUNDS) {
      if (sound.audio.kind !== "file") continue;
      expect(sound.audio.file, sound.id).toMatch(/^\/promo\/sounds\/[a-z0-9-]+-v\d+\.m4a$/);
      expect(existsSync(path.join(process.cwd(), "public", sound.audio.file)), sound.audio.file).toBe(true);
    }
  });

  it("the /promo files are cached forever by name (a changed sound = a new file name)", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/source: "\/promo\/:path\*",\s*headers: \[\s*\{\s*key: "Cache-Control",\s*value: "public, max-age=31536000, immutable"/);
  });

  it("every sound made in code has its code; ids are unique; there is music to pick", () => {
    for (const sound of PROMO_SOUNDS) {
      if (sound.audio.kind === "synth") expect(typeof PROMO_SYNTHS[sound.audio.synth], sound.id).toBe("function");
    }
    const ids = PROMO_SOUNDS.map((sound) => sound.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROMO_MUSIC.length).toBeGreaterThan(0);
  });

  it("sound names never say Reward (wording rule)", () => {
    expect(JSON.stringify(PROMO_SOUNDS)).not.toMatch(/reward/i);
  });
});
