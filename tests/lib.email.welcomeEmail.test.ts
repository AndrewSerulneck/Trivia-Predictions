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
});
