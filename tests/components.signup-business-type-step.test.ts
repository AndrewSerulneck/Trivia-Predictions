// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessTypeStep } from "@/components/signup/steps/BusinessTypeStep";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from "@/lib/partnerBusinessType";
import { BLANK_SIGNUP_DRAFT, SIGNUP_STEPS, signupStepIssue, validateSignupDraft } from "@/lib/selfServeSignup";
import { readSignupDraft, writeSignupDraft } from "@/components/signup/signupDraft";

vi.mock("@/components/signup/SignupStagger", () => ({
  SignupStagger: (p: { children: React.ReactNode }) => React.createElement("div", null, p.children),
  SignupStaggerItem: (p: { children: React.ReactNode }) => React.createElement("div", null, p.children),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("business type step", () => {
  it("is the first step", () => {
    expect(SIGNUP_STEPS[0]).toBe("business");
  });

  it("shows the question and the five labels, and a tap selects", () => {
    const onSelect = vi.fn();
    render(React.createElement(BusinessTypeStep, { value: "", onSelect }));
    expect(screen.getByText("What kind of business are you?")).toBeTruthy();
    for (const type of BUSINESS_TYPES) expect(screen.getByText(BUSINESS_TYPE_LABELS[type])).toBeTruthy();
    fireEvent.click(screen.getByText("Trivia DJ"));
    expect(onSelect).toHaveBeenCalledWith("trivia_dj");
  });

  it("the client step and the whole-draft server gate both require a value (Phase 4)", () => {
    expect(signupStepIssue("business", BLANK_SIGNUP_DRAFT)).toBeTruthy();
    expect(signupStepIssue("business", { ...BLANK_SIGNUP_DRAFT, businessType: "hotel" })).toBeNull();
    expect(validateSignupDraft({ ...BLANK_SIGNUP_DRAFT, name: "Alex Rivera" })).not.toBeNull();
    expect(
      validateSignupDraft({
        ...BLANK_SIGNUP_DRAFT,
        businessType: "bar_restaurant",
        name: "Alex Rivera",
        email: "alex@thecorner.example",
        password: "correct-horse",
        venueName: "The Corner Tap",
        street: "12 Main St",
        city: "Denver",
        state: "CO",
        zipCode: "80202",
        latitude: 39.7392,
        longitude: -104.9903,
      })
    ).toBeNull();
  });

  it("persists the type and drops a tampered stored value", () => {
    writeSignupDraft({ ...BLANK_SIGNUP_DRAFT, businessType: "movie_theater" });
    expect(readSignupDraft().businessType).toBe("movie_theater");
    window.sessionStorage.setItem("hc_signup_draft", JSON.stringify({ businessType: "nope" }));
    expect(readSignupDraft().businessType).toBe("");
  });
});
