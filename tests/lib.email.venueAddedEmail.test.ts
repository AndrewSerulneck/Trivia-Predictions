import { describe, expect, it } from "vitest";
import { buildVenueAddedEmail } from "@/lib/email/venueAddedEmail";
import { buildWelcomeEmail } from "@/lib/email/welcomeEmail";
import { fillTemplate } from "@/lib/email/emailFormat";

const baseInput = {
  venueName: "Joe's Bar & Grill",
  ownerName: "Joe",
  venueCount: 2,
  thisVenueCents: 7500,
  newMonthlyTotalCents: 17500,
  chargedTodayCents: 3750,
  tvSetupUrl: "https://play.hightopchallenge.com/tv",
  dashboardUrl: "https://play.hightopchallenge.com/owner/dashboard",
};

describe("buildVenueAddedEmail", () => {
  it("names the venue and shows the band price, new total and today's charge", () => {
    const { subject, html, text } = buildVenueAddedEmail(baseInput);
    expect(subject).toContain("Joe's Bar & Grill");
    for (const body of [html, text]) {
      expect(body).toContain("$75.00");
      expect(body).toContain("$175.00");
      expect(body).toContain("$37.50");
      expect(body).toContain("2 venues");
    }
  });

  it("leaves the 'charged today' line out when nothing was charged", () => {
    const { text } = buildVenueAddedEmail({ ...baseInput, chargedTodayCents: null });
    expect(text).not.toContain("Charged today");
    expect(buildVenueAddedEmail({ ...baseInput, chargedTodayCents: 0 }).text).not.toContain("Charged today");
  });

  it("escapes partner-typed names in the HTML only; subject and plain text stay literal", () => {
    const { subject, html, text } = buildVenueAddedEmail({ ...baseInput, venueName: "<b>Bar</b> & Grill" });
    expect(html).toContain("&lt;b&gt;Bar&lt;/b&gt; &amp; Grill");
    expect(html).not.toContain("<b>Bar</b>");
    expect(text).toContain("<b>Bar</b> & Grill");
    expect(subject).toContain("<b>Bar</b> & Grill");
  });

  it("greets generically without an owner name", () => {
    expect(buildVenueAddedEmail({ ...baseInput, ownerName: "" }).text.startsWith("Hi there,")).toBe(true);
  });

  it("links the TV setup and the Partner Dashboard", () => {
    const { html, text } = buildVenueAddedEmail(baseInput);
    for (const body of [html, text]) {
      expect(body).toContain(baseInput.tvSetupUrl);
      expect(body).toContain(baseInput.dashboardUrl);
    }
  });
});

// lib/email/partnerEmailCopy.ts is edited by hand (Andrew). A misspelled placeholder such as
// "{venuename}" is left in the email as written, on purpose, so it shows up in the preview —
// and this test turns it into a failing `npm run test` before it can reach a partner.
describe("partner email copy", () => {
  it("leaves no unfilled {placeholder} in either email", () => {
    const welcome = buildWelcomeEmail({
      venueName: "Pacific Street",
      ownerName: "Andrew",
      planAmountCents: 10000,
      tvSetupUrl: "https://x/tv",
      billingUrl: "https://x/b",
    });
    const added = buildVenueAddedEmail(baseInput);
    for (const email of [welcome, added]) {
      for (const part of [email.subject, email.html, email.text]) {
        expect(part).not.toMatch(/\{[A-Za-z]+\}/);
      }
    }
  });

  it("fillTemplate fills known placeholders once and leaves unknown ones visible", () => {
    expect(fillTemplate("{a} and {b} and {a}", { a: "1" })).toBe("1 and {b} and 1");
    expect(fillTemplate("{a}", { a: "$& {a}" })).toBe("$& {a}");
  });
});
