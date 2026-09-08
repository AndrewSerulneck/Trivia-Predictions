import { describe, expect, it } from "vitest";
import { buildWelcomeEmail } from "@/lib/email/welcomeEmail";

const baseInput = {
  venueName: "Joe's Bar",
  ownerName: "Joe",
  planAmountCents: 14000,
  tvSetupUrl: "https://play.hightopchallenge.com/tv",
  billingUrl: "https://play.hightopchallenge.com/owner/billing",
};

describe("buildWelcomeEmail", () => {
  it("confirms the subscription with venue name and formatted plan amount", () => {
    const { html, text } = buildWelcomeEmail(baseInput);
    expect(html).toContain("Joe's Bar");
    expect(html).toContain("$140.00");
    expect(text).toContain("Joe's Bar");
    expect(text).toContain("$140.00");
  });

  it("greets by owner name when provided, falls back generically when not", () => {
    const withName = buildWelcomeEmail(baseInput);
    expect(withName.text).toContain("Hi Joe,");

    const withoutName = buildWelcomeEmail({ ...baseInput, ownerName: "" });
    expect(withoutName.text).toContain("Hi there,");
  });

  it("includes the TV setup link and billing dashboard link", () => {
    const { html, text } = buildWelcomeEmail(baseInput);
    expect(html).toContain(baseInput.tvSetupUrl);
    expect(html).toContain(baseInput.billingUrl);
    expect(text).toContain(baseInput.tvSetupUrl);
    expect(text).toContain(baseInput.billingUrl);
  });

  it("lists all six player-facing games so partners know what they're offering", () => {
    const { text } = buildWelcomeEmail(baseInput);
    for (const game of ["Trivia", "Category Blitz", "Pick'em", "Bingo", "Predictions", "Fantasy"]) {
      expect(text).toContain(game);
    }
  });

  it("returns a non-empty subject", () => {
    const { subject } = buildWelcomeEmail(baseInput);
    expect(subject.length).toBeGreaterThan(0);
  });

  // Partner Self-Serve Signup — Phase 6. Before self-serve signup, `venueName`
  // and `ownerName` could only be set by an admin. They are now typed by an
  // unauthenticated stranger on /owner/signup, and they are interpolated into an
  // HTML string.
  describe("partner-supplied names in the HTML body", () => {
    it("escapes an ampersand — 'Bar & Grill' is the ordinary case, not an attack", () => {
      const { html, text } = buildWelcomeEmail({ ...baseInput, venueName: "Joe's Bar & Grill" });
      expect(html).toContain("Joe's Bar &amp; Grill");
      expect(html).not.toContain("Joe's Bar & Grill");
      // The plain-text branch is not markup and must stay literal.
      expect(text).toContain("Joe's Bar & Grill");
      expect(text).not.toContain("&amp;");
    });

    it("escapes markup in the venue name", () => {
      const { html } = buildWelcomeEmail({ ...baseInput, venueName: "<script>alert(1)</script>" });
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes markup in the owner name", () => {
      const { html, text } = buildWelcomeEmail({ ...baseInput, ownerName: "Ann <b>O'Neil</b>" });
      expect(html).not.toContain("<b>O'Neil</b>");
      expect(html).toContain("&lt;b&gt;O'Neil&lt;/b&gt;");
      expect(text).toContain("Ann <b>O'Neil</b>");
    });
  });
});
