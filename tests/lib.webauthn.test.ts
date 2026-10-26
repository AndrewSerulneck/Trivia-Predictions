import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseUserAndVenueFromRequest,
  decodePublicKeyFromBase64Url,
  encodePublicKeyToBase64Url,
  getCredentialTransportList,
  getExpectedPasskeyOrigins,
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

describe("native WebView passkey origin verification", () => {
  afterEach(() => vi.unstubAllEnvs());

  const fingerprint = Array(32).fill("AB").join(":");
  const challenge = { origin: "https://play.hightopchallenge.com", rp_id: "hightopchallenge.com" };
  const appOrigin = `android:apk-key-hash:${Buffer.alloc(32, 0xab).toString("base64url")}`;
  const configure = () => {
    vi.stubEnv("WEBAUTHN_RP_ID", "hightopchallenge.com");
    vi.stubEnv("WEBAUTHN_ALLOWED_ORIGINS", "https://hightopchallenge.com,https://play.hightopchallenge.com");
    vi.stubEnv("ANDROID_APP_CERT_SHA256", fingerprint);
  };

  it("keeps browser and iOS verification unchanged without a configured certificate", () => {
    configure();
    vi.stubEnv("ANDROID_APP_CERT_SHA256", "");
    expect(getExpectedPasskeyOrigins(challenge)).toBe(challenge.origin);
  });

  it("accepts only the exact configured app certificate alongside the challenge's web origin", () => {
    configure();
    expect(getExpectedPasskeyOrigins(challenge)).toEqual([challenge.origin, appOrigin]);
    expect(getExpectedPasskeyOrigins(challenge)).not.toContain("android:apk-key-hash:untrusted");
    expect(getExpectedPasskeyOrigins(challenge)).not.toContain("https://hightopchallenge.com");
  });

  it("supports a bounded configured signing-key rotation and removes duplicates", () => {
    configure();
    vi.stubEnv("ANDROID_APP_CERT_SHA256", `${fingerprint},${fingerprint},${Array(32).fill("CD").join(":")}`);
    expect(getExpectedPasskeyOrigins(challenge)).toEqual([
      challenge.origin, appOrigin, `android:apk-key-hash:${Buffer.alloc(32, 0xcd).toString("base64url")}`,
    ]);
  });

  it("ignores malformed fingerprints", () => {
    configure();
    vi.stubEnv("ANDROID_APP_CERT_SHA256", "AB:CD,*,android:apk-key-hash:anything");
    expect(getExpectedPasskeyOrigins(challenge)).toBe(challenge.origin);
  });

  it.each([
    { origin: "http://localhost:3000", rp_id: "localhost" },
    { origin: "http://play.hightopchallenge.com", rp_id: "hightopchallenge.com" },
    { origin: "https://attacker.example", rp_id: "hightopchallenge.com" },
    { origin: "https://play.hightopchallenge.com", rp_id: "attacker.example" },
    { origin: "https://hightopchallenge.com.attacker.example", rp_id: "hightopchallenge.com" },
    { origin: "not-an-origin", rp_id: "hightopchallenge.com" },
  ])("does not widen verification for $origin / $rp_id", (other) => {
    configure();
    expect(getExpectedPasskeyOrigins(other)).toBe(other.origin);
  });

  it("does not add app origins to an explicitly allowed external web origin", () => {
    configure();
    vi.stubEnv("WEBAUTHN_ALLOWED_ORIGINS", "https://external.example");
    const external = { ...challenge, origin: "https://external.example" };
    expect(getExpectedPasskeyOrigins(external)).toBe(external.origin);
  });
});
