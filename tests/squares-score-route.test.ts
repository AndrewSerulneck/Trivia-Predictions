import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Phase 3 — the shared Squares score endpoint and the screen's standing rules
// (docs/squares-and-brackets-plan.md §3, §6).

vi.mock("server-only", () => ({}));

const COL = [3, 7, 0, 9, 1, 5, 8, 2, 6, 4];
const ROW = [6, 2, 9, 0, 4, 8, 1, 7, 3, 5];

type Terminal = { data: unknown; error: { message: string } | null };

const eventRow = (patch: Record<string, unknown> = {}, moments: unknown[] = []) => ({
  id: "e1",
  season: 2026,
  bdl_game_id: 1,
  col_side: "visitor",
  col_team: { id: 1, abbreviation: "KC", fullName: "Kansas City Chiefs", name: "Chiefs" },
  row_team: { id: 2, abbreviation: "PHI", fullName: "Philadelphia Eagles", name: "Eagles" },
  kickoff_at: "2099-02-14T23:30:00+00:00",
  lock_at: "2099-02-14T23:00:00+00:00",
  lock_at_set_by: "auto",
  col_digits: COL,
  row_digits: ROW,
  drawn_at: null,
  live_score: null,
  feed_checked_at: null,
  completed_at: null,
  archived_at: null,
  created_by: "x",
  created_at: "2099-01-01T00:00:00+00:00",
  squares_event_moments: moments,
  ...patch,
});

const momentRow = (moment: string, patch: Record<string, unknown> = {}) => ({
  event_id: "e1",
  moment,
  grade_no: 1,
  observed_col_score: null,
  observed_row_score: null,
  observed_at: null,
  col_score: null,
  row_score: null,
  winning_cell: null,
  score_source: null,
  graded_at: null,
  mismatch_note: null,
  ...patch,
});

const mockAdmin = (terminal: Terminal) => {
  const select = vi.fn();
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    select(...args);
    return chain;
  };
  chain.is = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = async () => terminal;
  const from = vi.fn(() => chain);
  vi.doMock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from } }));
  return { from, select };
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabaseAdmin");
  vi.unstubAllEnvs();
});

describe("GET /api/squares/score", () => {
  it("404s, uncached, while the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    mockAdmin({ data: null, error: null });
    const { GET } = await import("@/app/api/squares/score/route");
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("is CDN-cacheable for 15 s when on, and reads the database ONCE (moments ride in the same select)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    const admin = mockAdmin({ data: eventRow(), error: null });
    const { GET } = await import("@/app/api/squares/score/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=15, stale-while-revalidate=15");
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(String(admin.select.mock.calls[0][0])).toContain("squares_event_moments(");
  });

  it("never caches an error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    mockAdmin({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/squares/score/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("boom");
    spy.mockRestore();
  });

  it("returns an empty view while no event exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    mockAdmin({ data: null, error: null });
    const { GET } = await import("@/app/api/squares/score/route");
    expect(await (await GET()).json()).toEqual({ ok: true, event: null, moments: [] });
  });
});

describe("the shared score view", () => {
  it("hides the digits until the draw, and shows them (and graded cells) after", async () => {
    mockAdmin({ data: eventRow({ drawn_at: null }), error: null });
    const { getSquaresScoreView } = await import("@/lib/squaresScore");
    const before = await getSquaresScoreView(Date.parse("2099-02-14T22:00:00Z"));
    expect(before.ok && before.value.event).toMatchObject({ phase: "open", colDigits: null, rowDigits: null });

    vi.resetModules();
    mockAdmin({
      data: eventRow({ drawn_at: "2099-02-14T23:00:05+00:00", live_score: { col: 7, row: 3, status: "Q1", statusState: "in", at: "x" } }, [
        momentRow("q1", { col_score: 7, row_score: 3, winning_cell: 81, score_source: "feed", graded_at: "2099-02-14T23:50:00+00:00" }),
        momentRow("half"),
        momentRow("q3"),
        momentRow("final"),
      ]),
      error: null,
    });
    const again = await import("@/lib/squaresScore");
    const after = await again.getSquaresScoreView(Date.parse("2099-02-14T23:55:00Z"));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.event).toMatchObject({
      phase: "drawn",
      colDigits: COL,
      rowDigits: ROW,
      liveScore: { col: 7, row: 3, status: "Q1" },
    });
    expect(after.value.moments.map((m) => [m.moment, m.points, m.result?.winningCell ?? null])).toEqual([
      ["q1", 25, 81],
      ["half", 25, null],
      ["q3", 25, null],
      ["final", 50, null],
    ]);
  });

  it("carries no player, claim, venue or internal field", async () => {
    mockAdmin({ data: eventRow({ drawn_at: "2099-02-14T23:00:05+00:00", created_by: "admin-secret" }), error: null });
    const { getSquaresScoreView } = await import("@/lib/squaresScore");
    const result = await getSquaresScoreView();
    const text = JSON.stringify(result);
    for (const forbidden of ["user", "venue", "username", "claim", "admin-secret", "created_by", "bdl", "feed_checked", "mismatch"]) {
      expect(text.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});

describe("Phase 3 standing rules", () => {
  const root = process.cwd();
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
  const filesIn = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir)).map((name) => path.join(dir, name));

  const SCREEN_FILES = [...filesIn("components/squares"), "lib/squaresView.ts", "app/squares/page.tsx"];

  it("the screen only talks to its own routes (never the sports feed)", () => {
    const urls = SCREEN_FILES.flatMap((file) => [...read(file).matchAll(/fetch\(\s*[`"']([^`"']+)/g)].map((m) => m[1]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith("/api/squares/"), url).toBe(true);
    for (const file of [...SCREEN_FILES, "lib/squaresScore.ts", "app/api/squares/score/route.ts"]) {
      expect(read(file), file).not.toMatch(/balldontlie|squaresFeed|BALLDONTLIE/i);
    }
  });

  it("follows the styling rules: Tailwind only (no inline style) and imports through @/", () => {
    for (const file of filesIn("components/squares")) {
      expect(read(file), file).not.toMatch(/style=\{\{/);
      expect(read(file), file).not.toMatch(/from "\.\.?\//);
    }
  });

  it("the squares are not <button>s (the phone button rules would swell them) and claims use haptic()", () => {
    expect(read("components/squares/SquaresGrid.tsx")).not.toContain("<button");
    expect(read("components/squares/SquaresGame.tsx")).toContain('from "@/lib/haptics"');
    expect(read("components/squares/SquaresGame.tsx")).not.toMatch(/navigator\.vibrate|playHaptic/);
  });

  it("the page is gated by the flag and the route is allowed in-session", () => {
    expect(read("app/squares/page.tsx")).toContain("isSquaresEnabled()");
    expect(read("app/squares/page.tsx")).toContain("notFound()");
    expect(read("components/auth/AuthNavigationGuard.tsx")).toContain('pathname.startsWith("/squares")');
    expect(read("lib/analytics.ts")).toContain('pathname.startsWith("/squares")');
  });

  it("the game name is not copied into the screen (decision 9)", () => {
    for (const file of SCREEN_FILES) expect(read(file), file).not.toContain("Super Bowl Squares");
  });

  it("the tutorial has art for every step", () => {
    const panel = read("components/venue/GameIdentityPanel.tsx");
    expect(panel).toContain('if (gameKey === "squares") return <SquaresIllustration');
  });
});
