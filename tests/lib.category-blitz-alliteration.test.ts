import { describe, expect, it } from "vitest";
import {
  ALLITERATION_BONUS_POINTS,
  alliterationBonus,
  isAlliterativeAnswer,
} from "@/lib/categoryBlitzAlliteration";

describe("isAlliterativeAnswer", () => {
  it("accepts 2+ words that all start with the round's letter", () => {
    expect(isAlliterativeAnswer("Prickly Pear", "P")).toBe(true);
    expect(isAlliterativeAnswer("Peter Piper Pepper", "P")).toBe(true);
  });

  it("rejects a single word, even on the right letter", () => {
    expect(isAlliterativeAnswer("Pear", "P")).toBe(false);
    expect(isAlliterativeAnswer("  Pear  ", "P")).toBe(false);
  });

  it("rejects when any word starts with another letter", () => {
    expect(isAlliterativeAnswer("Prickly apple", "P")).toBe(false);
    expect(isAlliterativeAnswer("Pirates of Penzance", "P")).toBe(false);
  });

  it("splits on hyphens", () => {
    expect(isAlliterativeAnswer("Peanut-Pie", "P")).toBe(true);
    expect(isAlliterativeAnswer("Peanut-apple", "P")).toBe(false);
    expect(isAlliterativeAnswer("Peanut–Pie", "P")).toBe(true); // en dash
  });

  it("rejects when the words alliterate on a different letter than the round's", () => {
    expect(isAlliterativeAnswer("Mint Mousse", "P")).toBe(false);
  });

  it("ignores case and punctuation", () => {
    expect(isAlliterativeAnswer("prickly PEAR!", "p")).toBe(true);
    expect(isAlliterativeAnswer("Peter's Pizza", "P")).toBe(true);
    expect(isAlliterativeAnswer("Pots & Pans", "P")).toBe(true); // "&" is not a word
    expect(isAlliterativeAnswer("\"Pink\" Panther", "P")).toBe(true);
  });

  it("drops a leading article, like answerStartsWithLetter", () => {
    expect(isAlliterativeAnswer("The Pink Panther", "P")).toBe(true);
    expect(isAlliterativeAnswer("A Purple Plum", "P")).toBe(true);
  });

  it("rejects empty input and a malformed letter", () => {
    expect(isAlliterativeAnswer("", "P")).toBe(false);
    expect(isAlliterativeAnswer("Prickly Pear", "")).toBe(false);
    expect(isAlliterativeAnswer("Prickly Pear", "PP")).toBe(false);
  });
});

describe("alliterationBonus", () => {
  it("is +1 for a scoring alliterative answer", () => {
    expect(ALLITERATION_BONUS_POINTS).toBe(1);
    expect(alliterationBonus("Prickly Pear", "P", 2)).toBe(1);
    expect(alliterationBonus("Prickly Pear", "P", 1)).toBe(1); // a Majority Rules solo answer
  });

  it("is never applied to a 0-point answer", () => {
    expect(alliterationBonus("Prickly Pear", "P", 0)).toBe(0);
  });

  it("is 0 for a scoring answer that does not alliterate", () => {
    expect(alliterationBonus("Pear", "P", 2)).toBe(0);
  });
});
