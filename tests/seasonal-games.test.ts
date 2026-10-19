import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEASONAL_GAME_WINDOWS,
  isBracketsEnabled,
  isSquaresEnabled,
  seasonalCalendarDate,
  seasonalCardState,
  seasonalWindowState,
  venueHomeCardState,
} from "@/lib/seasonalGames";
import {
  BRACKET_ROUND_POINTS,
  SEASONAL_CREDIT_BATCH_MAX,
  SEASONAL_CREDIT_MAX_POINTS,
  SEASONAL_POINTS_SOURCES,
  SEASONAL_SOURCE_KEY_MAX_LENGTH,
  SQUARES_MOMENT_POINTS,
  bracketVenuePoints,
  seasonalCreditProblem,
} from "@/lib/seasonalPoints";
import { VENUE_GAME_CARDS, VENUE_HOME_GAME_KEYS, inferVenueGameKeyFromPath, type VenueGameKey } from "@/lib/venueGameCards";

// Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 1: seasonal cards, flags,
// names in one copy file, and the venue-points scale.

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
};
const APP_SOURCES = ["app", "components", "lib"].flatMap(sourceFiles);
const filesContaining = (needle: string): string[] => APP_SOURCES.filter((rel) => read(rel).includes(needle));
/** Files whose code (comments stripped) contains `text`: string literals and JSX text alike. */
const filesWithCode = (text: string): string[] =>
  APP_SOURCES.filter((rel) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .includes(text),
  );

/** A wall-clock moment on US Eastern time: EST (UTC-5) before 2 a.m. Mar 14, 2027, EDT (UTC-4) after. */
const eastern = (date: string, time = "12:00"): Date => new Date(`${date}T${time}:00-05:00`);
const easternDst = (date: string, time = "12:00"): Date => new Date(`${date}T${time}:00-04:00`);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seasonal card windows (decision 12)", () => {
  it("reads the calendar on US Eastern time", () => {
    expect(seasonalCalendarDate(new Date("2027-02-01T04:59:00Z"))).toBe("2027-01-31");
    expect(seasonalCalendarDate(new Date("2027-02-01T05:00:00Z"))).toBe("2027-02-01");
  });

  it("shows Squares Feb 1–15, 2027, with no teaser", () => {
    const w = SEASONAL_GAME_WINDOWS.squares;
    expect(seasonalWindowState(w, eastern("2027-01-31", "23:59"))).toBe("hidden");
    expect(seasonalWindowState(w, eastern("2027-02-01", "00:00"))).toBe("open");
    expect(seasonalWindowState(w, eastern("2027-02-14", "21:00"))).toBe("open");
    expect(seasonalWindowState(w, eastern("2027-02-15", "23:59"))).toBe("open");
    expect(seasonalWindowState(w, eastern("2027-02-16", "00:00"))).toBe("hidden");
  });

  it("teases Brackets from Mar 1 and opens them Selection Sunday through Apr 6, 2027", () => {
    const w = SEASONAL_GAME_WINDOWS.bracket;
    expect(seasonalWindowState(w, eastern("2027-02-28", "23:59"))).toBe("hidden");
    expect(seasonalWindowState(w, eastern("2027-03-01", "00:00"))).toBe("teaser");
    expect(seasonalWindowState(w, eastern("2027-03-13", "23:59"))).toBe("teaser");
    expect(seasonalWindowState(w, eastern("2027-03-14", "00:00"))).toBe("open");
    expect(seasonalWindowState(w, easternDst("2027-04-06", "23:59"))).toBe("open");
    expect(seasonalWindowState(w, easternDst("2027-04-07", "00:00"))).toBe("hidden");
  });

  it("hides a card while its flag is off, even inside its window", () => {
    const inSquares = eastern("2027-02-10");
    const inBrackets = easternDst("2027-03-20");
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    expect(isSquaresEnabled()).toBe(false);
    expect(isBracketsEnabled()).toBe(false);
    expect(seasonalCardState("squares", inSquares)).toBe("hidden");
    expect(seasonalCardState("bracket", inBrackets)).toBe("hidden");

    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    expect(seasonalCardState("squares", inSquares)).toBe("open");
    expect(seasonalCardState("bracket", inBrackets)).toBe("hidden");
    expect(seasonalCardState("squares", eastern("2027-01-20"))).toBe("hidden");

    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "1");
    expect(seasonalCardState("bracket", inBrackets)).toBe("open");
  });

  it("always shows the year-round games", () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    const now = eastern("2026-11-01");
    for (const key of VENUE_HOME_GAME_KEYS) {
      expect(venueHomeCardState(key, now), key).toBe(key === "squares" || key === "bracket" ? "hidden" : "open");
    }
  });
});

describe("seasonal game wiring", () => {
  it("registers both games as Venue Home cards with their own routes", () => {
    for (const key of ["squares", "bracket"] as const) {
      expect(VENUE_HOME_GAME_KEYS).toContain(key);
      const card = VENUE_GAME_CARDS.find((c) => c.key === key);
      expect(card?.path).toBe(`/${key}`);
      expect(inferVenueGameKeyFromPath(`/${key}`)).toBe(key);
    }
  });

  it("puts every Venue Home card in the hub's display order", () => {
    const hub = read("components/venue/VenueHubClient.tsx");
    const order = hub.match(/const VENUE_HUB_GAME_ORDER: VenueGameKey\[\] = \[([\s\S]*?)\];/);
    expect(order).not.toBeNull();
    for (const key of VENUE_HOME_GAME_KEYS) expect(order?.[1], key).toContain(`"${key}"`);
  });

  it("filters the hub's cards through venueHomeCardState (no request, a date check)", () => {
    expect(read("components/venue/VenueHubClient.tsx")).toContain("venueHomeCardState(key, now)");
  });

  it("reads each flag in exactly one place", () => {
    for (const flag of ["NEXT_PUBLIC_SQUARES_ENABLED", "NEXT_PUBLIC_BRACKETS_ENABLED"]) {
      expect(filesContaining(`process.env.${flag}`), flag).toEqual(["lib/seasonalGames.ts"]);
    }
  });

  it("keeps each on-screen game name in the one copy file (decision 9)", () => {
    for (const name of ["Super Bowl Squares", "March Madness"]) {
      expect(filesWithCode(name), name).toEqual(["lib/venueGameCards.ts"]);
    }
  });
});

describe("seasonal venue points (decision 11)", () => {
  it("pays Squares 25 / 25 / 25 / 50", () => {
    expect(SQUARES_MOMENT_POINTS).toEqual({ q1: 25, half: 25, q3: 25, final: 50 });
  });

  it("scores brackets 10 → 320 and pays a tenth as venue points", () => {
    expect(BRACKET_ROUND_POINTS).toEqual([10, 20, 40, 80, 160, 320]);
    const mainMax = BRACKET_ROUND_POINTS.reduce((sum, pts, round) => sum + pts * 2 ** (5 - round), 0);
    const secondChanceMax = BRACKET_ROUND_POINTS.slice(2).reduce((sum, pts, i) => sum + pts * 2 ** (3 - i), 0);
    expect(mainMax).toBe(1920);
    expect(secondChanceMax).toBe(1280);
    expect(bracketVenuePoints(mainMax)).toBe(192);
    expect(bracketVenuePoints(secondChanceMax)).toBe(128);
    expect(bracketVenuePoints(0)).toBe(0);
  });

  it("validates a credit the same way the SQL does", () => {
    const ok = { userId: "00000000-0000-0000-0000-000000000001", sourceKey: "board:q1", points: 25 };
    expect(seasonalCreditProblem(ok)).toBeNull();
    expect(seasonalCreditProblem({ ...ok, userId: "nope" })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, sourceKey: "" })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, sourceKey: " padded" })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, sourceKey: "x".repeat(SEASONAL_SOURCE_KEY_MAX_LENGTH + 1) })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, points: 0 })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, points: 2.5 })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, points: SEASONAL_CREDIT_MAX_POINTS + 1 })).not.toBeNull();
    expect(seasonalCreditProblem({ ...ok, points: SEASONAL_CREDIT_MAX_POINTS })).toBeNull();
  });

  it("mirrors the migration's limits and sources", () => {
    const migration = readdirSync(path.join(ROOT, "supabase/migrations")).find((name) => name.endsWith("_seasonal_points_credits.sql"));
    expect(migration).toBeDefined();
    const sql = read(`supabase/migrations/${migration}`);
    expect(sql).toContain(`check (points between 1 and ${SEASONAL_CREDIT_MAX_POINTS})`);
    expect(sql).toContain(`check (char_length(source_key) between 1 and ${SEASONAL_SOURCE_KEY_MAX_LENGTH})`);
    expect(sql).toContain(`if v_count > ${SEASONAL_CREDIT_BATCH_MAX} then`);
    const sources = SEASONAL_POINTS_SOURCES.map((s) => `'${s}'`).join(", ");
    expect(sql).toContain(`check (source in (${sources}))`);
    expect(sql).toContain(`p_source not in (${sources})`);
  });

  it("has one caller of the credit RPC", () => {
    expect(filesContaining('"credit_seasonal_points"')).toEqual(["lib/seasonalPointsCredit.ts"]);
  });
});

// The real LegalPage shell mounts the app router's Back button; only the rules text matters here.
vi.mock("@/components/legal/LegalPage", async () => {
  const React = await import("react");
  type Props = { title?: string; summary?: string; heading?: string; items?: readonly React.ReactNode[]; children?: React.ReactNode };
  const block = ({ title, summary, heading, items, children }: Props) =>
    React.createElement("div", null, title, summary, heading, ...(items ?? []), children);
  return { LegalPage: block, LegalSection: block, LegalList: block };
});

describe("Official Rules (/rules)", () => {
  const renderRules = async (): Promise<string> => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: RulesPage } = await import("@/app/rules/page");
    return renderToStaticMarkup(RulesPage());
  };

  it("says nothing about the seasonal games while their flags are off", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    const html = await renderRules();
    expect(html).not.toContain("Super Bowl Squares");
    expect(html).not.toContain("March Madness");
    expect(html).toContain("Prizes are skill-based; they are not a lottery or game of chance.");
  });

  it("adds each game's rules, the chance disclosure and the league disclaimer once its flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
    const html = await renderRules();
    expect(html).toContain("Super Bowl Squares");
    expect(html).toContain("March Madness");
    expect(html).toContain("randomly drawn numbers");
    expect(html).toContain("If nobody holds the winning square, nobody wins that moment");
    expect(html).toContain("10, 20, 40, 80, 160, 320 points");
    expect(html).toContain("not affiliated with, sponsored or endorsed by the NFL, the NCAA");
  });
});

describe("Venue Home tiles", () => {
  it("draws the seasonal tiles, with the teaser line on a card that has not opened yet", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { VenueGamesPanel } = await import("@/components/venue/VenueGamesPanel");
    const cards = VENUE_GAME_CARDS.filter((c) => c.key === "squares" || c.key === "bracket");
    const html = renderToStaticMarkup(
      React.createElement(VenueGamesPanel, {
        contentReady: true,
        showFastPathSkeleton: false,
        arrivalStatusText: "",
        arrivalStage: "ready",
        arrivalProgress: 100,
        liveTriviaStatus: { live: false, label: "", nextStartAtMs: null, failureReason: null, recurringType: null, recurringDays: [] },
        nextLiveTriviaCountdownLabel: "",
        nextLiveTriviaCountdownSeconds: null,
        lobbyButtonShouldPulse: false,
        pendingDestination: null,
        orderedHomeCards: cards,
        teaserGames: new Set<VenueGameKey>(["bracket"]),
        visibleBadgeByGame: new Map(),
        badgeError: "",
        onGoTo: () => {},
        onRetryBadges: () => {},
      }),
    );
    expect(html).toContain('data-venue-game-card="squares"');
    expect(html).toContain("Super Bowl<br/>Squares");
    expect(html).toContain("Claim your squares for the big game.");
    expect(html).toContain("March<br/>Madness");
    expect(html).toContain("Brackets open Selection Sunday, March 14.");
    expect(html).not.toContain("Fill out your bracket and take on the whole bar.");
  });
});
