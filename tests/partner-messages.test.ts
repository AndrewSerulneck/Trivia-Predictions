// Phase 5.5 (docs/native-app-store-plan.md): partner-written messages — the words/links filter, the send
// path (claim → after-reply push), report and pause, and the static guarantees (one flag reader, one caller
// per RPC, website-only compose box, every route checks who is asking before it reads).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getVenueDisplayName: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/venueDisplayName", () => ({ getVenueDisplayName: mocks.getVenueDisplayName }));

import {
  checkPartnerMessage,
  partnerMessageIdFromSearch,
  partnerMessageLength,
  PARTNER_MESSAGE_COPY,
  PARTNER_MESSAGE_MAX_LENGTH,
  PARTNER_MESSAGE_REPORTS_TO_PAUSE,
  PARTNER_MESSAGES_DAILY_CAP,
} from "@/lib/partnerMessageRules";
import {
  listVenueMessagesForAdmin,
  localDateIn,
  reportVenueMessage,
  sendVenueMessage,
  setVenueMessagesPaused,
  venueMessagePath,
  VenueMessagesUnavailableError,
} from "@/lib/push/venueMessages";
import { resetFcmCacheForTests } from "@/lib/push/fcm";
import { VENUE_NEWS_DAILY_CAP, VENUE_NEWS_MAX_IDLE_DAYS } from "@/lib/push/venueNews";
import { OWNER_MENU_ITEMS, visibleOwnerMenuItems } from "@/components/owner/menu/ownerMenuItems";
import { OWNER_SHEET_IDS } from "@/lib/ownerSheetParams";
import { webOnlyPageFor } from "@/lib/nativeLinkOut";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
const SOURCE = [...walk("app"), ...walk("lib"), ...walk("components")];
const filesContaining = (needle: string): string[] => SOURCE.filter((file) => read(file).includes(needle));

const MESSAGE_ID = "11111111-2222-3333-4444-555555555555";

describe("the words and links filter", () => {
  it("accepts an ordinary bar message and tidies it to one line", () => {
    expect(checkPartnerMessage("  Half-price wings\nduring trivia tonight! 🍗  ")).toEqual({
      ok: true,
      text: "Half-price wings during trivia tonight! 🍗",
    });
    for (const fine of [
      "Sex on the Beach cocktails $5 tonight",
      "Kill it at trivia, Thursday 8pm",
      "Dickens night at the bar: classic glasses",
      "Scunthorpe fans welcome",
      "Follow us @pacificstreet",
      "Call 555-0134 to book a table",
      "Doors at 7.30, game at 8",
    ]) {
      expect(checkPartnerMessage(fine).ok, fine).toBe(true);
    }
  });

  it("refuses empty, too long (counted like Postgres: an emoji is one), links and emails", () => {
    expect(checkPartnerMessage("   \n ")).toEqual({ ok: false, problem: "empty" });
    expect(partnerMessageLength("🍗".repeat(PARTNER_MESSAGE_MAX_LENGTH))).toBe(PARTNER_MESSAGE_MAX_LENGTH);
    expect(checkPartnerMessage("🍗".repeat(PARTNER_MESSAGE_MAX_LENGTH)).ok).toBe(true);
    expect(checkPartnerMessage("x".repeat(PARTNER_MESSAGE_MAX_LENGTH + 1))).toEqual({ ok: false, problem: "too_long" });
    for (const link of ["Menu at https://example.org/x", "See www.pacific.example", "Visit pacificstreet.com", "Book: bit.ly/abc", "Email me@bar.net"]) {
      expect(checkPartnerMessage(link), link).toEqual({ ok: false, problem: "link" });
    }
  });

  it("refuses slurs, sexual words and strong swearing, including look-alike spellings", () => {
    for (const bad of ["What the fuck", "F U C K this", "sh1t show tonight", "$hit", "fuckyeah trivia", "you b1tch"]) {
      const result = checkPartnerMessage(bad);
      // "F U C K" spelled out letter by letter is caught by the run-together check.
      expect(result, bad).toEqual({ ok: false, problem: "words" });
    }
  });

  it("matches inside each word and inside spelled-out letters, never across real words (Phase 10.2)", () => {
    for (const fine of [
      "Bring your mother for brunch",
      "Mother Friday special",
      "Mother's Day brunch",
      "Half-price wings tonight!",
    ]) {
      expect(checkPartnerMessage(fine).ok, fine).toBe(true);
    }
    for (const bad of ["fuckyeah", "f u c k", "f.u.c.k", "F-U-C-K", "MOTHERFUCKER", "m0therf*cker", "go f u c k yourself"]) {
      expect(checkPartnerMessage(bad), bad).toEqual({ ok: false, problem: "words" });
    }
  });

  it("finds a message id only in the expected query parameter", () => {
    expect(partnerMessageIdFromSearch(`?message=${MESSAGE_ID}`)).toBe(MESSAGE_ID);
    expect(partnerMessageIdFromSearch("?message=not-an-id")).toBeNull();
    expect(partnerMessageIdFromSearch("")).toBeNull();
    expect(venueMessagePath("venue-pacific-street", MESSAGE_ID)).toBe(`/venue/venue-pacific-street?message=${MESSAGE_ID}`);
  });

  it("each limit is one named number", () => {
    expect(PARTNER_MESSAGES_DAILY_CAP).toBe(2);
    expect(PARTNER_MESSAGE_REPORTS_TO_PAUSE).toBe(3);
    expect(PARTNER_MESSAGE_MAX_LENGTH).toBe(150);
    expect(VENUE_NEWS_DAILY_CAP).toBe(5); // 5.4's cap is untouched and separate.
    expect(PARTNER_MESSAGE_COPY.remaining(0)).toContain(`${PARTNER_MESSAGES_DAILY_CAP} a day`);
    expect(filesContaining("PARTNER_MESSAGES_DAILY_CAP = ")).toEqual(["lib/partnerMessageRules.ts"]);
  });
});

describe("sending, reporting", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const TOKEN = (n: number) => `token-${n}-${"x".repeat(30)}`;

  beforeEach(() => {
    resetFcmCacheForTests();
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: "hightop-test",
      client_email: "sender@hightop-test.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    });
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.getVenueDisplayName.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  });

  it("a filtered message never reaches the database", async () => {
    expect(await sendVenueMessage({ venueId: "v1", ownerId: "o1", text: "visit bar.com" })).toEqual({ ok: false, reason: "link" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("claims through the RPC with its own cap, then pushes the bar name + message to every phone after the reply", async () => {
    mocks.rpc.mockResolvedValue({
      data: [1, 2].map((n) => ({ outcome: "claimed", message_id: MESSAGE_ID, device_id: `d${n}`, token: TOKEN(n) })),
      error: null,
    });
    mocks.getVenueDisplayName.mockResolvedValue("Pacific Street");
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://oauth2.googleapis.com/token")
        ? new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }), { status: 200 })
        : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVenueMessage({ venueId: "v1", ownerId: "o1", text: " Wings  half price! " });
    expect(result).toEqual({ ok: true, messageId: MESSAGE_ID, devices: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_venue_message_push", {
      p_venue_id: "v1",
      p_owner_id: "o1",
      p_body: "Wings half price!",
      p_daily_cap: PARTNER_MESSAGES_DAILY_CAP,
      p_max_idle_days: VENUE_NEWS_MAX_IDLE_DAYS,
    });
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("fcm.googleapis.com"))).toHaveLength(2),
    );
    const send = fetchMock.mock.calls.find(([url]) => String(url).includes("fcm.googleapis.com")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(send[1].body))).toMatchObject({
      message: {
        notification: { title: "Pacific Street", body: "Wings half price!" },
        data: { path: `/venue/v1?message=${MESSAGE_ID}` },
      },
    });
  });

  it("passes the RPC's refusals through and sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const outcome of ["paused", "capped", "no_audience", "unknown_venue"]) {
      mocks.rpc.mockResolvedValue({ data: [{ outcome, message_id: null, device_id: null, token: null }], error: null });
      expect(await sendVenueMessage({ venueId: "v1", ownerId: "o1", text: "Trivia at 8" })).toEqual({ ok: false, reason: outcome });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    resetFcmCacheForTests();
    expect(await sendVenueMessage({ venueId: "v1", ownerId: "o1", text: "Trivia at 8" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reports with the one pause threshold", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: "reported", paused: false }], error: null });
    expect(await reportVenueMessage(MESSAGE_ID, "u1")).toEqual({ outcome: "reported", paused: false });
    expect(mocks.rpc).toHaveBeenCalledWith("report_venue_message", {
      p_message_id: MESSAGE_ID,
      p_user_id: "u1",
      p_pause_threshold: PARTNER_MESSAGE_REPORTS_TO_PAUSE,
    });
  });

  // Phase 10.1 F2: an un-pause must also mark the bar's reports reviewed, or the next report re-pauses it.
  it("admin un-pause is the unpause_venue_messages RPC, never a plain delete", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await setVenueMessagesPaused("v1", false);
    expect(mocks.rpc).toHaveBeenCalledWith("unpause_venue_messages", { p_venue_id: "v1" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("a missing un-pause RPC fails closed: logged, unavailable (503), and nothing deleted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.unpause_venue_messages" } });
    await expect(setVenueMessagesPaused("v1", false)).rejects.toBeInstanceOf(VenueMessagesUnavailableError);
    expect(error).toHaveBeenCalledWith("[Push] unpause-rpc-missing", { venueId: "v1" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("admin pause is unchanged: one upsert with reason 'admin'", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert });
    await setVenueMessagesPaused("v1", true);
    expect(mocks.from).toHaveBeenCalledWith("push_venue_message_pauses");
    expect(upsert.mock.calls[0][0]).toMatchObject({ venue_id: "v1", reason: "admin", message_id: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("the admin list shows reports since the last review, counted in people, from the RPC", async () => {
    const query = (data: unknown) => {
      const chain = { select: () => chain, order: () => chain, limit: () => chain, in: () => chain, then: undefined as unknown };
      const result = Promise.resolve({ data, error: null });
      return Object.assign(chain, { then: result.then.bind(result) });
    };
    mocks.from.mockImplementation((table: string) =>
      table === "push_venue_messages"
        ? query([{ id: MESSAGE_ID, venue_id: "v1", body: "Hi", sent_at: "2026-10-26T00:00:00Z", devices: 4 }])
        : table === "push_venue_message_pauses"
          ? query([])
          : query([{ id: "v1", name: "Pacific Street" }]),
    );
    mocks.rpc.mockResolvedValue({ data: [{ message_id: MESSAGE_ID, reports: 2 }], error: null });
    const { messages } = await listVenueMessagesForAdmin();
    expect(mocks.rpc).toHaveBeenCalledWith("venue_message_report_counts", { p_message_ids: [MESSAGE_ID] });
    expect(mocks.from).not.toHaveBeenCalledWith("push_venue_message_reports");
    expect(messages).toEqual([expect.objectContaining({ id: MESSAGE_ID, venueName: "Pacific Street", reports: 2 })]);
  });

  it("counts the day in the bar's own timezone (bad timezone → New York)", () => {
    const ms = Date.parse("2026-10-24T02:30:00Z");
    expect(localDateIn("America/Los_Angeles", ms)).toBe("2026-10-23");
    expect(localDateIn("Europe/London", ms)).toBe("2026-10-24");
    expect(localDateIn("Not/AZone", ms)).toBe("2026-10-23");
  });
});

describe("partner messages contract (Phase 5.5)", () => {
  it("one reader of the flag; the menu row and sheet exist only while it is on", () => {
    expect(filesContaining("process.env.NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED")).toEqual(["lib/partnerMessageRules.ts"]);
    expect(visibleOwnerMenuItems(false, false).some((item) => item.id === "messages")).toBe(false);
    expect(visibleOwnerMenuItems(false, true).find((item) => item.id === "messages")?.sheet).toBe("messages");
    expect(OWNER_MENU_ITEMS.find((item) => item.id === "messages")?.href).toBeUndefined();
    expect(OWNER_SHEET_IDS).toContain("messages");
    expect(read("app/owner/dashboard/page.tsx")).toMatch(/isPartnerMessagesEnabled\(\) \? \(\s*<Suspense fallback=\{null\}>\s*<MessagesSheetHost/);
  });

  it("the compose box is on the website only: /owner opens in the browser, never in the app", () => {
    expect(webOnlyPageFor("/owner/dashboard")).toBe("/owner");
  });

  it("only lib/push/venueMessages.ts calls the RPCs or writes a pause", () => {
    for (const needle of [
      "claim_venue_message_push",
      "read_venue_message",
      "report_venue_message",
      "venue_message_report_counts",
      "unpause_venue_messages",
      "push_venue_message_pauses",
    ]) {
      expect(filesContaining(needle), needle).toEqual(["lib/push/venueMessages.ts"]);
    }
  });

  it("the admin route answers 503 when partner messages are unavailable (e.g. the 10.1 migration is missing)", () => {
    const src = read("app/api/admin/route.ts");
    for (const call of ["await listVenueMessagesForAdmin()", "await setVenueMessagesPaused("]) {
      const at = src.indexOf(call);
      const branch = src.slice(at, at + 600);
      expect(at, call).toBeGreaterThan(-1);
      expect(branch, call).toContain("error instanceof VenueMessagesUnavailableError");
      expect(branch, call).toContain("status: 503");
    }
  });

  it("the admin panel and both admin branches stay off while the flag is off (Phase 10.2)", () => {
    const admin = read("app/api/admin/route.ts");
    for (const marker of ['resource === "partner-messages") {', 'body.resource === "partner-messages") {']) {
      const at = admin.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      const head = admin.slice(at, at + 250);
      expect(head, marker).toContain("!isPartnerMessagesEnabled()");
      expect(head, marker).toContain("status: 404");
    }
    expect(read("components/admin/sections/VenuesSection.tsx")).toContain("{isPartnerMessagesEnabled() ? <PartnerMessagesPanel /> : null}");
  });

  it("reports count people and an un-pause sticks (Phase 10.1 migration)", () => {
    const sql = read("supabase/migrations/20261026173304_partner_message_report_rules.sql");
    expect(sql).toContain("coalesce(u.account_id::text, u.id::text)");
    expect(sql).toContain("reports_reviewed_at");
    expect(sql).toMatch(/grant execute on function public\.unpause_venue_messages\(text\) to service_role/);
  });

  it("the partner route 404s while off and checks the partner owns the venue before any read or write", () => {
    const src = read("app/api/owner/messages/route.ts");
    for (const handler of ["GET", "POST"]) {
      const body = src.slice(src.indexOf(`export async function ${handler}`));
      const flag = body.indexOf("isPartnerMessagesEnabled()");
      const gate = body.indexOf("await authorize(request, venueId)");
      const work = Math.max(body.indexOf("getVenueMessageStatus("), body.indexOf("sendVenueMessage("));
      expect(flag).toBeGreaterThan(-1);
      expect(gate).toBeGreaterThan(flag);
      expect(work).toBeGreaterThan(gate);
    }
    expect(src).toContain("auth.venueIds.includes(venueId)");
  });

  it("the player route needs a signed session and never takes a user id from the request", () => {
    const src = read("app/api/push/messages/[messageId]/route.ts");
    expect(src).toContain("isSessionEnforced()");
    expect(src).toContain("resolveRequestUserId(request, null)");
    expect(src).not.toMatch(/searchParams|request\.json/);
  });

  it("the compose box talks only to its own route", () => {
    const src = read("components/owner/messages/PartnerMessagesSheet.tsx");
    const urls = src.match(/fetch\(\s*[`"][^`"?]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/\/api\/owner\/messages$/);
  });

  it("popup ads wait while a tapped message is open", () => {
    expect(read("components/ui/PopupAds.tsx")).toContain("partnerMessageIdFromSearch(window.location.search)");
  });

  it("partner messages ride on the 'news' switch: the RPC's audience is the 5.4 audience", () => {
    const sql = read("supabase/migrations/20261023145024_push_venue_messages.sql");
    expect(sql).toContain("and d.notify_news");
    expect(sql).toContain("claim_venue_news_push (20261023141109): keep them in step");
  });
});
