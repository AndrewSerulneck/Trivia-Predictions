// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartnerManual } from "@/components/owner/PartnerManual";
import { PARTNER_MANUAL } from "@/lib/partnerManual";

describe("Partner Manual: where guests find their prizes", () => {
  it("has the section, placed after Offer Prizes, with the live sample card figure", () => {
    const headings = PARTNER_MANUAL.sections.map((section) => section.heading);
    expect(headings.indexOf("Where Guests Find Their Prizes")).toBe(headings.indexOf("Offer Prizes") + 1);
    const section = PARTNER_MANUAL.sections.find((s) => s.heading === "Where Guests Find Their Prizes");
    expect(section?.figure).toBe("prize-card");
    expect(section?.body).toContain("tap the card to flip it over");
  });

  it("renders the flat sample card (no back, never flips)", () => {
    const { container } = render(createElement(PartnerManual, { open: true, onOpenChange: () => {}, showTrigger: false }));
    expect(screen.getByText("Where Guests Find Their Prizes")).toBeTruthy();
    const card = container.ownerDocument.querySelector("[data-prize-card]");
    expect(card).toBeTruthy();
    expect(card?.hasAttribute("data-prize-card-flipped")).toBe(false);
    expect(container.ownerDocument.querySelector("[data-prize-card-toggle]")).toBeNull();
    expect(card?.textContent).toContain("$25");
    expect(card?.textContent).toContain("YOUR VENUE");
  });
});
