import { describe, expect, it } from "vitest";
import { suggestAcceptableAnswers } from "@/lib/triviaAnswerSuggestions";

describe("trivia answer suggestions", () => {
  it("suggests full-name expansions for known acronyms", () => {
    expect(suggestAcceptableAnswers("UCLA")).toContain("University of California, Los Angeles");
  });

  it("suggests acronym reversals for full names", () => {
    expect(suggestAcceptableAnswers("University of Southern California")).toContain("USC");
  });

  it("suggests nickname variants for people", () => {
    expect(suggestAcceptableAnswers("Stephen Curry")).toContain("Steph Curry");
  });

  it("suggests year-sensitive team shorthands without dropping the year entirely", () => {
    const suggestions = suggestAcceptableAnswers("1972 Dolphins");
    expect(suggestions).toContain("72 Dolphins");
    expect(suggestions).not.toContain("Dolphins");
  });

  it("suggests full-year team shorthand for long team names", () => {
    expect(suggestAcceptableAnswers("2016 Golden State Warriors")).toContain("2016 Warriors");
  });
});
