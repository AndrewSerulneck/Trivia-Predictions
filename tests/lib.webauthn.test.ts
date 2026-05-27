import { describe, expect, it } from "vitest";
import {
  chooseUserAndVenueFromRequest,
  decodePublicKeyFromBase64Url,
  encodePublicKeyToBase64Url,
  getCredentialTransportList,
  normalizeUsernameForLookup,
  parseBearerToken,
  resolveRpIdForOrigin,
  sanitizeUserId,
} from "@/lib/webauthn";

describe("lib/webauthn helpers", () => {
  it("normalizes usernames for case-insensitive lookup", () => {
    expect(normalizeUsernameForLookup("  PlAyEr_One  ")).toBe("player_one");
  });

  it("parses bearer tokens safely", () => {
    const request = new Request("http://localhost", {
      headers: {
        Authorization: "Bearer token-123",
      },
    });
    expect(parseBearerToken(request)).toBe("token-123");
  });

  it("sanitizes uuid user ids", () => {
    expect(sanitizeUserId("00000000-0000-4000-8000-000000000001")).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
    expect(sanitizeUserId("not-a-uuid")).toBe("");
  });

  it("chooses body user/venue over cookie hints", () => {
    const request = new Request("http://localhost", {
      headers: {
        cookie:
          "tp_user_id=00000000-0000-4000-8000-000000000999; tp_venue_id=venue-cookie",
      },
    });
    const chosen = chooseUserAndVenueFromRequest(request, {
      userId: "00000000-0000-4000-8000-000000000001",
      venueId: "venue-body",
    });
    expect(chosen).toEqual({
      userId: "00000000-0000-4000-8000-000000000001",
      venueId: "venue-body",
    });
  });

  it("filters only supported authenticator transports", () => {
    expect(getCredentialTransportList(["hybrid", "invalid", "usb"])).toEqual(["hybrid", "usb"]);
  });

  it("round-trips public key base64url encoding", () => {
    const bytes = new Uint8Array([1, 2, 3, 240, 250, 255]);
    const encoded = encodePublicKeyToBase64Url(bytes);
    const decoded = decodePublicKeyFromBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("resolves localhost rp id for local origin", () => {
    expect(resolveRpIdForOrigin("http://localhost:3000")).toBe("localhost");
  });
});
