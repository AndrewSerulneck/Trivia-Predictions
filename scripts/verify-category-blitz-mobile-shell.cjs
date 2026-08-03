#!/usr/bin/env node

/**
 * Category Blitz mobile-shell regression harness (Phase 7 of
 * docs/category-blitz-app-feel-plan.md).
 *
 * Headless Playwright cannot reproduce the iOS-only symptoms this plan was
 * written to chase (the magenta band, the keyboard-open frame tear) — every
 * phase from 2 through 6 recorded that honestly, and this harness does not
 * pretend otherwise. What IS DOM-observable, and what six blind device
 * attempts never had a regression test for, is asserted here:
 *
 *   - Finding A (stale/scaled row transforms): the direct check is the
 *     `data-category-blitz-row-projected` marker reading 0 once the reveal
 *     morph's settle window has passed. Phase 2 found that comparing row
 *     rects before/after a simulated keyboard resize does NOT distinguish a
 *     projected row from a plain one in headless Chromium (Framer only
 *     re-measures on React commits, and shrinking the frame doesn't move row
 *     rects — the answer list absorbs the height change). The rect-delta
 *     check below is kept anyway as the indirect half of the same finding
 *     (per the plan's own instruction), but the marker is load-bearing.
 *   - Finding G (persistent side strips at rest): the backdrop
 *     (`[data-category-blitz-game-root]`) must exactly cover
 *     `{0,0,innerWidth,innerHeight}`.
 *   - Finding B/C (stray overlays): no `position: fixed` element with a
 *     higher z-index than the game root may intersect the visual viewport
 *     during gameplay, and no `#a10d63` ("brand magenta") layer may exist in
 *     the DOM outside the reverse-round takeover animation.
 *   - The page itself never scrolls (`window.scrollY === 0`) throughout.
 *
 * This is NOT the device gate. Phase 8 (device acceptance) is the only real
 * exit criterion for the plan's five acceptance criteria. Passing this
 * harness means the DOM-observable half of the regressions attempts 1-6
 * introduced won't come back; it says nothing about Safari's own chrome or
 * the keyboard's paint timing.
 *
 * Prerequisites:
 *   - Dev server on :3000 (`npm run dev`).
 *   - `.env.local` with NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node --env-file=.env.local --conditions react-server --import tsx \
 *     scripts/verify-category-blitz-mobile-shell.cjs [--keep] [--base-url <url>]
 *
 * Seeding notes (all found the hard way across Phases 3-6, see the plan's
 * per-phase handoffs):
 *   - `sim-category-blitz` runs in CONTINUOUS mode by default in this
 *     `.env.local` (NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT=true, no
 *     per-venue row needed for that to apply). The continuous engine can
 *     silently abandon/advance past a round this script starts directly via
 *     `engine.startRound()` before the page ever renders it. This script opts
 *     the sim venue back onto the scheduled engine for the duration of the
 *     run (`category_blitz_continuous_config.is_active = false`, per
 *     CLAUDE.md's Category Blitz section) and removes that override row on
 *     teardown, restoring "no row = continuous default".
 *   - `startRound(sessionId)` takes only `sessionId` — no `testMode` arg;
 *     pass `testMode` via `createSession` instead.
 *   - Start the round BEFORE navigating (not after), and navigate within ~2s:
 *     `RoundStartReveal` only mounts while the round is younger than
 *     `ROUND_START_REVEAL_MAX_MS` (3s). Warm the route with an earlier `goto`
 *     first so a dev compile doesn't eat that window.
 *   - Never trust the seed script's own `round.letter`/`round.categories` —
 *     read what the client actually rendered
 *     (`[data-category-blitz-letter-badge]` textContent) instead.
 *   - Drive the game with `?cbzDebug=1` OFF. That panel is `fixed
 *     z-[99999]` and hit-tests over the answer rows, which produces false
 *     focus-loss failures.
 *
 * Exit code is non-zero if any hard check fails.
 */

const crypto = require("node:crypto");
const { createHmac } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

function parseArgs(argv) {
  const args = { keep: false, baseUrl: "http://localhost:3000" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--keep") args.keep = true;
    else if (argv[i] === "--base-url") args.baseUrl = String(argv[++i] ?? args.baseUrl);
  }
  return args;
}

// ── Tiny assertion framework (mirrors scripts/simulate-category-blitz.cjs) ──

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m",
};
const stats = { pass: 0, fail: 0 };

function hard(label, cond, detail = "") {
  if (cond) { stats.pass += 1; console.log(`  ${C.green}✓${C.reset} ${label}`); }
  else { stats.fail += 1; console.log(`  ${C.red}✗ ${label}${C.reset}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`); }
}

function section(title) {
  console.log(`\n${C.bold}${C.cyan}▸ ${title}${C.reset}`);
}

// ── Supabase (service role) for setup/teardown ──────────────────────────────

function getAdminClient() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const SIM_VENUE_ID = "sim-category-blitz";

async function ensureSimVenue(db) {
  const { data } = await db.from("venues").select("id").eq("id", SIM_VENUE_ID).maybeSingle();
  if (data) return;
  const { error } = await db.from("venues").insert({
    id: SIM_VENUE_ID,
    name: "Category Blitz Simulation",
    latitude: 0,
    longitude: 0,
    radius: 100,
  });
  if (error) throw new Error(`Failed to create sim venue: ${error.message}`);
}

/** Opt the sim venue back onto the scheduled engine for a deterministic run —
 *  see the seeding notes above for why the continuous engine can't be trusted
 *  to leave a manually-started round alone. */
async function disableContinuousModeForRun(db) {
  const { error } = await db
    .from("category_blitz_continuous_config")
    .upsert({ venue_id: SIM_VENUE_ID, is_active: false }, { onConflict: "venue_id" });
  if (error) throw new Error(`Failed to opt sim venue off continuous mode: ${error.message}`);
}

async function restoreContinuousDefault(db) {
  await db.from("category_blitz_continuous_config").delete().eq("venue_id", SIM_VENUE_ID);
}

async function createSimPlayers(db, count, runId) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const email = `cbzharness_${runId}_${i}@cbsim.test`;
    const username = `cbzh${runId}u${i}`;
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (authErr || !authData?.user) throw new Error(`auth.admin.createUser failed: ${authErr?.message}`);
    const authId = authData.user.id;

    const { data: profile, error: profErr } = await db
      .from("users")
      .insert({
        auth_id: authId,
        username,
        username_normalized: username.toLowerCase(),
        venue_id: SIM_VENUE_ID,
        points: 0,
      })
      .select("id, auth_id, username")
      .single();
    if (profErr || !profile) throw new Error(`users insert failed: ${profErr?.message}`);
    players.push({ userId: profile.id, authId: profile.auth_id, username: profile.username });
  }
  return players;
}

async function teardown(db, players, keep) {
  if (keep) {
    console.log(`${C.dim}--keep set: leaving sim session/players/continuous-config override in place.${C.reset}`);
    return;
  }
  await db.from("category_blitz_sessions").delete().eq("venue_id", SIM_VENUE_ID);
  await restoreContinuousDefault(db);
  if (players.length > 0) {
    await db.from("users").delete().in("id", players.map((p) => p.userId));
    for (const p of players) {
      await db.auth.admin.deleteUser(p.authId).catch(() => undefined);
    }
  }
  console.log(`${C.dim}Torn down ${players.length} sim players + continuous-config override.${C.reset}`);
}

// ── Auth cookies (mirrors scripts/print-test-auth-cookies.cjs) ─────────────

function makeSessionCookieValue(userId) {
  const secret = String(process.env.SESSION_SECRET ?? "").trim();
  const payload = Buffer.from(JSON.stringify({ uid: userId })).toString("base64url");
  if (!secret) return null;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function buildAuthCookies(userId, venueId, baseUrl) {
  const sessValue = makeSessionCookieValue(userId);
  return [
    { name: "tp_user_id", value: userId, url: baseUrl },
    { name: "tp_venue_id", value: venueId, url: baseUrl },
    ...(sessValue ? [{ name: "tp_sess", value: sessValue, url: baseUrl }] : []),
  ];
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = crypto.randomBytes(3).toString("hex");
  const db = getAdminClient();
  const { chromium } = require("playwright");

  let players = [];
  let browser = null;

  try {
    section("Seed");
    await ensureSimVenue(db);
    await disableContinuousModeForRun(db);
    await db.from("category_blitz_sessions").delete().eq("venue_id", SIM_VENUE_ID);
    players = await createSimPlayers(db, 3, runId);
    console.log(`  seeded ${players.length} players (run ${runId})`);

    const engineMod = await import("../lib/categoryBlitz.ts");
    const engine = engineMod;

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await context.addCookies(buildAuthCookies(players[0].userId, SIM_VENUE_ID, args.baseUrl));

    // Warm the route so a dev-server compile doesn't eat the ~2s reveal window.
    await page.goto(`${args.baseUrl}/category-blitz/play`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const session = await engine.createSession(SIM_VENUE_ID, { source: "manual" });
    for (const p of players) {
      await engine.registerSessionPresence({
        sessionId: session.id,
        userId: p.userId,
        authId: p.authId,
        venueId: SIM_VENUE_ID,
      });
    }
    await engine.startRound(session.id);

    await page.goto(`${args.baseUrl}/category-blitz/play`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-category-blitz-answer-input="0"]', { timeout: 15000 });

    section("Finding G — the game root exactly covers the layout viewport at rest");
    const restGeometry = await page.evaluate(() => {
      const root = document.querySelector("[data-category-blitz-game-root]");
      const rect = root ? root.getBoundingClientRect() : null;
      return {
        rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });
    hard(
      "game root rect exists",
      !!restGeometry.rect,
      "no [data-category-blitz-game-root] found"
    );
    if (restGeometry.rect) {
      hard(
        "game root top/left are 0",
        restGeometry.rect.top === 0 && restGeometry.rect.left === 0,
        JSON.stringify(restGeometry.rect)
      );
      hard(
        "game root width === innerWidth, height === innerHeight",
        restGeometry.rect.width === restGeometry.innerWidth &&
          restGeometry.rect.height === restGeometry.innerHeight,
        JSON.stringify(restGeometry)
      );
    }

    section("Finding B/C — no stray overlay above the game root, no brand-magenta layer");
    const overlaySnapshot = await page.evaluate(() => {
      const animationOverlay = document.querySelector("[data-animation-overlay]");
      let magentaCount = 0;
      for (const el of document.querySelectorAll("*")) {
        if (animationOverlay?.contains(el)) continue;
        const style = window.getComputedStyle(el);
        if (
          style.backgroundColor.includes("161, 13, 99") ||
          style.backgroundImage.includes("161, 13, 99")
        ) {
          magentaCount += 1;
        }
      }
      const gameRootZ = 100; // CategoryBlitzGame.tsx BACKDROP_CLASS z-[100]
      const vv = window.visualViewport;
      const viewportRect = {
        top: vv ? vv.offsetTop : 0,
        left: vv ? vv.offsetLeft : 0,
        bottom: (vv ? vv.offsetTop + vv.height : window.innerHeight),
        right: (vv ? vv.offsetLeft + vv.width : window.innerWidth),
      };
      let strayOverlays = 0;
      const strayDebug = [];
      for (const el of document.querySelectorAll("*")) {
        const style = window.getComputedStyle(el);
        if (style.position !== "fixed") continue;
        const z = Number(style.zIndex);
        if (!Number.isFinite(z) || z <= gameRootZ) continue;
        if (el.hasAttribute("data-category-blitz-game-root")) continue;
        // Dev-only test-mode toggle / skip-round button / DevAnimationPanel
        // (NODE_ENV !== "production" only, real players never see these) —
        // legitimate to run at z-[999] over gameplay in a dev build, not a
        // production stray-overlay regression. Marked with
        // data-category-blitz-dev-only for exactly this exclusion.
        if (el.hasAttribute("data-category-blitz-dev-only")) continue;
        const rect = el.getBoundingClientRect();
        const intersects =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left < viewportRect.right &&
          rect.right > viewportRect.left &&
          rect.top < viewportRect.bottom &&
          rect.bottom > viewportRect.top;
        if (intersects) {
          strayOverlays += 1;
          strayDebug.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 120), z, rect: { w: rect.width, h: rect.height, t: rect.top, l: rect.left } });
        }
      }
      return { magentaCount, strayOverlays, strayDebug };
    });
    hard("no brand-magenta (#a10d63) layer in the DOM", overlaySnapshot.magentaCount === 0, `magentaCount=${overlaySnapshot.magentaCount}`);
    hard(
      "no higher-z fixed overlay intersects the visual viewport",
      overlaySnapshot.strayOverlays === 0,
      `strayOverlays=${overlaySnapshot.strayOverlays} ${JSON.stringify(overlaySnapshot.strayDebug)}`
    );

    section("Finding A — layout projection is retired after the reveal morph settles");
    // Poll for up to 2s: if the page mounted inside the reveal window,
    // projectedRows starts at 12 and must fall to 0 within LAYOUT_MORPH_SETTLE_MS.
    let projectedRows = await page.evaluate(
      () => document.querySelectorAll("[data-category-blitz-row-projected]").length
    );
    const sawProjection = projectedRows > 0;
    for (let i = 0; i < 20 && projectedRows > 0; i += 1) {
      await page.waitForTimeout(100);
      projectedRows = await page.evaluate(
        () => document.querySelectorAll("[data-category-blitz-row-projected]").length
      );
    }
    hard("projected rows settle to 0", projectedRows === 0, `projectedRows=${projectedRows}, sawProjection=${sawProjection}`);

    section("Row rects move by one uniform delta on a keyboard-open simulation (indirect Finding A check)");
    const beforeRects = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-category-blitz-answer-row]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left };
      })
    );
    await page.setViewportSize({ width: 390, height: 504 }); // ~340px keyboard-open simulation
    await page.waitForTimeout(300);
    const afterRects = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-category-blitz-answer-row]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left };
      })
    );
    hard("row wrap count unchanged across resize", beforeRects.length === afterRects.length && beforeRects.length === 12, `before=${beforeRects.length} after=${afterRects.length}`);
    const deltas = beforeRects.map((b, i) => afterRects[i] ? afterRects[i].top - b.top : NaN);
    const uniqueDeltas = new Set(deltas.map((d) => Math.round(d)));
    hard(
      "every row moved by the same vertical delta (no per-row displacement)",
      uniqueDeltas.size === 1,
      `deltas=${JSON.stringify(deltas)}`
    );
    const noHorizontalDrift = beforeRects.every((b, i) => !afterRects[i] || Math.round(afterRects[i].left - b.left) === 0);
    hard("no row shifted horizontally", noHorizontalDrift);

    section("Page never scrolls");
    const scrollY = await page.evaluate(() => Math.round(window.scrollY));
    hard("window.scrollY === 0 after the resize", scrollY === 0, `scrollY=${scrollY}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    // Phase 8 (device acceptance): Andrew's iPhone capture showed only 2-3
    // answer rows visible with the keyboard open, against an acceptance target
    // of 5+. `compactChrome` drops the Back bar, the invite banner, the mode
    // rule and the editor's helper line for as long as a row is being typed
    // into. Both halves are asserted — a compact mode that never turns off
    // would be its own regression.
    section("Keyboard-open chrome reduction (compactChrome)");
    const restChrome = await page.evaluate(() => ({
      compactMarker: document.querySelectorAll("[data-category-blitz-compact-chrome]").length,
      backBar: document.querySelectorAll('[aria-label="Back to venue"]').length,
    }));
    hard("at rest: no compact marker", restChrome.compactMarker === 0, JSON.stringify(restChrome));
    hard("at rest: the Back bar is present", restChrome.backBar === 1, JSON.stringify(restChrome));

    // 410px, not the 504px used above: this mirrors the visible viewport actually
    // measured on Andrew's iPhone 16 Pro with the keyboard open (Phase 8's
    // After-Fixes.png), so the >=5 row target is asserted against the real
    // budget rather than a roomier simulation.
    await page.setViewportSize({ width: 390, height: 410 });
    await page.waitForTimeout(200);
    await page.locator('[data-category-blitz-answer-row="0"]').click();
    await page.waitForTimeout(600); // let the settle-scroll land

    const typingChrome = await page.evaluate(() => {
      const list = document.querySelector("[data-category-blitz-answer-list]");
      const listRect = list ? list.getBoundingClientRect() : null;
      const vv = window.visualViewport;
      const vTop = vv ? vv.offsetTop : 0;
      const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      // A row counts only if it is ENTIRELY inside both the scroll container
      // and the visual viewport — a half-clipped row is not a usable target.
      const visibleTop = listRect ? Math.max(listRect.top, vTop) : 0;
      const visibleBottom = listRect ? Math.min(listRect.bottom, vBottom) : 0;
      let fullyVisibleRows = 0;
      for (const el of document.querySelectorAll("[data-category-blitz-answer-row]")) {
        const r = el.getBoundingClientRect();
        if (r.top >= visibleTop - 0.5 && r.bottom <= visibleBottom + 0.5) fullyVisibleRows += 1;
      }
      return {
        compactMarker: document.querySelectorAll("[data-category-blitz-compact-chrome]").length,
        backBar: document.querySelectorAll('[aria-label="Back to venue"]').length,
        // Focus now lives on the row's OWN input — there is no shared editor.
        editorFocused:
          document.activeElement instanceof HTMLElement &&
          document.activeElement.hasAttribute("data-category-blitz-answer-input"),
        listHeight: listRect ? Math.round(visibleBottom - visibleTop) : 0,
        fullyVisibleRows,
        rowPitch: (() => {
          const rows = document.querySelectorAll("[data-category-blitz-answer-row]");
          if (rows.length < 2) return 0;
          return Math.round(
            rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
          );
        })(),
        rowHeight: (() => {
          const r = document.querySelector("[data-category-blitz-answer-row]");
          return r ? Math.round(r.getBoundingClientRect().height) : 0;
        })(),
        inputHeight: (() => {
          const r = document.querySelector("[data-category-blitz-answer-input]");
          return r ? Math.round(r.getBoundingClientRect().height) : 0;
        })(),
        scrollY: Math.round(window.scrollY),
      };
    });
    hard("typing: compact marker is present", typingChrome.compactMarker === 1, JSON.stringify(typingChrome));
    hard("typing: the Back bar has yielded its space", typingChrome.backBar === 0, JSON.stringify(typingChrome));
    hard("typing: the editor is focused", typingChrome.editorFocused, JSON.stringify(typingChrome));
    hard(
      "typing: at least 5 answer rows are fully visible",
      typingChrome.fullyVisibleRows >= 5,
      `fullyVisibleRows=${typingChrome.fullyVisibleRows} listHeight=${typingChrome.listHeight}`
    );
    hard("typing: the page still never scrolls", typingChrome.scrollY === 0, JSON.stringify(typingChrome));
    console.log(
      `  ${C.dim}${typingChrome.fullyVisibleRows} rows fully visible in a ${typingChrome.listHeight}px list `
        + `(row ${typingChrome.rowHeight}px, pitch ${typingChrome.rowPitch}px, input ${typingChrome.inputHeight}px)${C.reset}`
    );

    // Scroll the list and tap a row further down: this is the second half of
    // the Phase 8 ask ("scroll down and click into another field with ease").
    // The focus correction must not fight the manual scroll — a row the player
    // just scrolled to must stay where they put it.
    const scrollThenTap = await page.evaluate(async () => {
      const list = document.querySelector("[data-category-blitz-answer-list]");
      if (!list) return { ok: false };
      list.scrollBy({ top: 200, behavior: "auto" });
      await new Promise((r) => setTimeout(r, 150));
      return { ok: true, scrollTop: Math.round(list.scrollTop) };
    });
    const rowAfterScroll = await page.evaluate(() => {
      const list = document.querySelector("[data-category-blitz-answer-list]");
      const listRect = list.getBoundingClientRect();
      for (const el of document.querySelectorAll("[data-category-blitz-answer-row]")) {
        const r = el.getBoundingClientRect();
        if (r.top >= listRect.top && r.bottom <= listRect.bottom) {
          return Number(el.getAttribute("data-category-blitz-answer-row"));
        }
      }
      return null;
    });
    await page.locator(`[data-category-blitz-answer-row="${rowAfterScroll}"]`).click();
    await page.waitForTimeout(600);
    const afterTap = await page.evaluate(() => {
      const list = document.querySelector("[data-category-blitz-answer-list]");
      return {
        scrollTop: Math.round(list.scrollTop),
        focusedRow:
          document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("data-category-blitz-answer-input")
            : null,
        // Focus now lives on the row's OWN input — there is no shared editor.
        editorFocused:
          document.activeElement instanceof HTMLElement &&
          document.activeElement.hasAttribute("data-category-blitz-answer-input"),
        compactMarker: document.querySelectorAll("[data-category-blitz-compact-chrome]").length,
      };
    });
    hard(
      "scroll-then-tap: the list did not jump back",
      Math.abs(afterTap.scrollTop - scrollThenTap.scrollTop) <= 2,
      `scrolledTo=${scrollThenTap.scrollTop} afterTap=${afterTap.scrollTop} row=${rowAfterScroll}`
    );
    hard("scroll-then-tap: a row input holds focus", afterTap.editorFocused, JSON.stringify(afterTap));
    hard(
      "scroll-then-tap: the focused input is the row that was tapped",
      Number(afterTap.focusedRow) === rowAfterScroll,
      `focusedRow=${afterTap.focusedRow} tapped=${rowAfterScroll}`
    );
    hard("scroll-then-tap: chrome stayed compact", afterTap.compactMarker === 1, JSON.stringify(afterTap));

    // Phase 8 round 2: the answer rows own their inputs and there is no pinned
    // editor duplicating the active row above the keyboard. Typing must land in
    // the tapped row itself.
    section("Answer rows own their inputs (no duplicate pinned editor)");
    await page.keyboard.type("Zebra");
    await page.waitForTimeout(150);
    const typed = await page.evaluate((row) => {
      const own = document.querySelector(`[data-category-blitz-answer-input="${row}"]`);
      const inputs = Array.from(document.querySelectorAll("[data-category-blitz-answer-input]"));
      return {
        ownValue: own ? own.value : null,
        rowInputCount: inputs.length,
        pinnedEditors: document.querySelectorAll("[data-category-blitz-editor-input]").length,
        // Any OTHER input showing the same text would be the duplicate field.
        otherInputsWithText: Array.from(document.querySelectorAll("input"))
          .filter((el) => el !== own && el.value.trim().length > 0).length,
      };
    }, rowAfterScroll);
    hard("one input per answer row, twelve total", typed.rowInputCount === 12, JSON.stringify(typed));
    hard("no pinned editor input exists", typed.pinnedEditors === 0, JSON.stringify(typed));
    hard("typing landed in the tapped row's own input", typed.ownValue === "Zebra", JSON.stringify(typed));
    hard("no second field mirrors the active answer", typed.otherInputsWithText === 0, JSON.stringify(typed));

    await page.setViewportSize({ width: 390, height: 844 });
  } finally {
    if (browser) await browser.close();
    await teardown(db, players, args.keep);
  }

  console.log(`\n${C.bold}${stats.fail === 0 ? C.green : C.red}${stats.pass} passed, ${stats.fail} failed${C.reset}`);
  if (stats.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
