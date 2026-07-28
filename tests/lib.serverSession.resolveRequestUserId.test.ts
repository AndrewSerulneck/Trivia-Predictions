import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionCookie, resolveRequestUserId } from "@/lib/serverSession";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

/** Extract the raw `tp_sess=...` pair from a Set-Cookie string. */
const cookieHeaderFor = (userId: string): string =>
  createSessionCookie(userId).split(";")[0];

const requestWith = (cookie?: string): Request =>
  new Request("https://example.test/api/nfl-pickem/leaderboard", {
    headers: cookie ? { cookie } : {},
  });

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

describe("resolveRequestUserId", () => {
  describe("with sessions enforced", () => {
    beforeEach(() => {
      process.env.SESSION_SECRET = "test-secret-for-resolve-request-user-id";
    });

    it("rejects a claimed userId that does not match the session", () => {
      const result = resolveRequestUserId(requestWith(cookieHeaderFor("attacker")), "victim");
      expect(result).toEqual({ userId: null, forbidden: true });
    });

    it("rejects a claimed userId with no session at all", () => {
      expect(resolveRequestUserId(requestWith(), "victim")).toEqual({
        userId: null,
        forbidden: true,
      });
    });

    it("rejects a claimed userId backed by a forged (unsigned) cookie", () => {
      const forged = `tp_sess=${Buffer.from(JSON.stringify({ uid: "victim" })).toString("base64url")}`;
      expect(resolveRequestUserId(requestWith(forged), "victim")).toEqual({
        userId: null,
        forbidden: true,
      });
    });

    it("accepts a claimed userId that matches the signed session", () => {
      expect(resolveRequestUserId(requestWith(cookieHeaderFor("player-1")), "player-1")).toEqual({
        userId: "player-1",
        forbidden: false,
      });
    });

    it("falls back to the session user when no userId is claimed", () => {
      expect(resolveRequestUserId(requestWith(cookieHeaderFor("player-1")), null)).toEqual({
        userId: "player-1",
        forbidden: false,
      });
    });

    it("allows an anonymous read when nothing is claimed and no session exists", () => {
      expect(resolveRequestUserId(requestWith(), null)).toEqual({
        userId: null,
        forbidden: false,
      });
    });

    it("treats a blank claimed userId as no claim", () => {
      expect(resolveRequestUserId(requestWith(), "   ")).toEqual({
        userId: null,
        forbidden: false,
      });
    });
  });

  describe("without SESSION_SECRET (local dev)", () => {
    beforeEach(() => {
      delete process.env.SESSION_SECRET;
    });

    it("passes the claimed userId through, since there is nothing to verify", () => {
      expect(resolveRequestUserId(requestWith(), "player-1")).toEqual({
        userId: "player-1",
        forbidden: false,
      });
    });

    it("returns null rather than an empty string when nothing is claimed", () => {
      expect(resolveRequestUserId(requestWith(), "")).toEqual({
        userId: null,
        forbidden: false,
      });
    });
  });
});
