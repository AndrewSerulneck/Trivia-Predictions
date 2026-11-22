import { describe, expect, it } from "vitest";
import { marketingUrl } from "@/lib/domainSplit";
import { ownerLoginWithReturn, safeOwnerReturnPath } from "@/lib/ownerAuthCodes";
import { normalizeTvCode, parsePairCode, parseTypedDisplayCode, tvConnectUrl } from "@/lib/tvConnectShared";

// docs/fire-tv-app-plan.md Phase 3 — code normalizing, the QR URL and the sign-in return path.

describe("code normalizing", () => {
  it("uppercases, drops spaces/hyphens and reads O as 0, I and L as 1", () => {
    expect(normalizeTvCode(" k7-o2 ")).toBe("K702");
    expect(normalizeTvCode("ilIL")).toBe("1111");
  });

  it("parses a typed display code tolerantly", () => {
    expect(parseTypedDisplayCode("k7m2")).toBe("K7M2");
    expect(parseTypedDisplayCode("kom2")).toBe("K0M2");
    expect(parseTypedDisplayCode("l7m2")).toBe("17M2");
    for (const bad of ["", "K7M", "K7M22", "K7MU", "K7M!"]) expect(parseTypedDisplayCode(bad)).toBeNull();
  });

  it("parses a 6-character connect code", () => {
    expect(parsePairCode("7k3m9q")).toBe("7K3M9Q");
    expect(parsePairCode("7K3MOQ")).toBe("7K3M0Q");
    for (const bad of [null, 42, "", "7K3M9", "7K3M9QX", "7K3M9U"]) expect(parsePairCode(bad)).toBeNull();
  });
});

describe("tvConnectUrl", () => {
  it("is the partner phone page on the apex (never a phone-app link)", () => {
    expect(tvConnectUrl("7K3M9Q")).toBe(marketingUrl("/owner/display/connect?c=7K3M9Q"));
  });
});

describe("safeOwnerReturnPath", () => {
  it("keeps same-site /owner/ paths with their query", () => {
    expect(safeOwnerReturnPath("/owner/display/connect?c=7K3M9Q")).toBe("/owner/display/connect?c=7K3M9Q");
    expect(safeOwnerReturnPath("/owner/dashboard")).toBe("/owner/dashboard");
  });

  it("refuses anything that could leave the site or the partner area", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/owner/x",
      "//evil.example/owner/x",
      "/\\evil.example",
      "/owner\\..\\admin",
      "/owner/../admin",
      "/admin",
      "/venue/x",
      "owner/display",
      "/owner/\u0000x",
      `/owner/${"a".repeat(400)}`,
    ]) {
      expect(safeOwnerReturnPath(bad)).toBeNull();
    }
  });

  it("builds the sign-in link with an encoded return path", () => {
    expect(ownerLoginWithReturn("/owner/display/connect?c=7K3M9Q")).toBe(
      "/owner/login?next=%2Fowner%2Fdisplay%2Fconnect%3Fc%3D7K3M9Q",
    );
    expect(ownerLoginWithReturn("https://evil.example")).toBe("/owner/login");
  });
});
