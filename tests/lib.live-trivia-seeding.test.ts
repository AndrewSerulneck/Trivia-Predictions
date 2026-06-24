import { describe, expect, it } from "vitest";

import {
  buildBandTargets,
  buildQuestionProfile,
  createEmptyBandCounts,
  getSourceBand,
  getSourcePercentile,
  inferQuestionStem,
  inferSlugFamily,
  inferTemplateKey,
  inferTopicTokens,
  normalizeDiversityText,
  normalizeLiveTriviaCategory,
  normalizeLiveTriviaSeedQuestion,
  scoreCandidate,
  violatesHardSpacing,
  type NormalizedLiveTriviaSeedQuestion,
} from "@/lib/liveTriviaSeeding";

function makeRow(overrides: Partial<NormalizedLiveTriviaSeedQuestion> = {}): NormalizedLiveTriviaSeedQuestion {
  return {
    slug: "history-us-presidents-2024",
    question: "What year did George Washington become president?",
    category: "History",
    options: ["1789"],
    correct_answer: 0,
    question_pool: "live_showdown",
    sourceOrder: 4,
    sourcePercentile: getSourcePercentile(4, 15),
    sourceBand: getSourceBand(getSourcePercentile(4, 15)),
    ...overrides,
  };
}

describe("live trivia seeding metadata helpers", () => {
  it("normalizes category and diversity text deterministically", () => {
    expect(normalizeLiveTriviaCategory("  Pop   Culture  ")).toBe("Pop Culture");
    expect(normalizeLiveTriviaCategory("")).toBe("General");
    expect(normalizeDiversityText("Beyonce & Jay-Z: 2003!")).toBe("beyonce and jay z 2003");
  });

  it("infers stable slug families by removing trailing variants", () => {
    expect(inferSlugFamily("movie-quotes-star-wars-01")).toBe("movie-quotes-star-wars");
    expect(inferSlugFamily("sports-nba-finals-2024")).toBe("sports-nba-finals");
    expect(inferSlugFamily("beatles-ii")).toBe("beatles-ii");
    expect(inferSlugFamily("madonna-2")).toBe("madonna");
  });

  it("classifies common question templates", () => {
    expect(inferTemplateKey("In what year did the Berlin Wall fall?")).toBe("what-year");
    expect(inferTemplateKey("What is the capital of Peru?")).toBe("what-is");
    expect(inferTemplateKey("Who was the first host of the show?")).toBe("who-is");
    expect(inferTemplateKey("Which team won the championship?")).toBe("which-team");
    expect(inferTemplateKey("Which country borders Spain?")).toBe("which-country");
    expect(inferTemplateKey("Name this Oscar-winning actor.")).toBe("name-this");
    expect(inferTemplateKey("A clue with no known opening")).toBe("generic");
  });

  it("infers deterministic stems and topic tokens", () => {
    expect(inferQuestionStem("What year did George Washington become president?")).toBe(
      "year-george-washington-become-president"
    );

    const tokens = inferTopicTokens("US History", "What year did George Washington become president?");
    expect(Array.from(tokens)).toEqual(["history", "year", "george", "washington", "become", "president"]);
  });

  it("maps source order to start, middle, and end bands", () => {
    const bands = Array.from({ length: 15 }, (_, index) => getSourceBand(getSourcePercentile(index, 15)));

    expect(bands.filter((band) => band === "start")).toHaveLength(5);
    expect(bands.filter((band) => band === "middle")).toHaveLength(5);
    expect(bands.filter((band) => band === "end")).toHaveLength(5);
    expect(getSourceBand(getSourcePercentile(0, 1))).toBe("middle");
  });

  it("normalizes seed questions with stable source metadata", () => {
    const row = normalizeLiveTriviaSeedQuestion(
      {
        slug: "music-grammys-1",
        question: "Who is the artist behind this album?",
        category: " Music ",
        options: ["Beyonce"],
        correct_answer: "0",
        question_pool: "live_showdown",
      },
      10,
      15
    );

    expect(row).toMatchObject({
      slug: "music-grammys-1",
      question: "Who is the artist behind this album?",
      category: "Music",
      correct_answer: 0,
      question_pool: "live_showdown",
      sourceOrder: 10,
      sourceBand: "end",
    });
  });

  it("builds a complete question profile", () => {
    const profile = buildQuestionProfile(makeRow());

    expect(profile.slug).toBe("history-us-presidents-2024");
    expect(profile.slugFamily).toBe("history-us-presidents");
    expect(profile.templateKey).toBe("what-year");
    expect(profile.cluster).toBe("history:year-george-washington-become");
    expect(profile.stem).toBe("history:year-george-washington-become-president");
    expect(profile.sourceBand).toBe("start");
    expect(Array.from(profile.topicTokens)).toEqual(["history", "year", "george", "washington", "become", "president"]);
  });

  it("builds even-as-possible source-band targets", () => {
    expect(buildBandTargets(10)).toEqual({ start: 4, middle: 3, end: 3 });
    expect(buildBandTargets(14)).toEqual({ start: 5, middle: 5, end: 4 });
    expect(buildBandTargets(15)).toEqual({ start: 5, middle: 5, end: 5 });
  });

  it("detects hard slug-family and adjacent-template spacing violations", () => {
    const first = buildQuestionProfile(makeRow({ slug: "history-president-washington-1" }));
    const sameFamily = buildQuestionProfile(makeRow({ slug: "history-president-washington-2" }));
    const sameTemplate = buildQuestionProfile(
      makeRow({
        slug: "history-president-jefferson",
        question: "What year did Thomas Jefferson become president?",
      })
    );
    const different = buildQuestionProfile(
      makeRow({
        slug: "history-civil-war-appomattox",
        question: "Who was the general at Appomattox?",
      })
    );

    expect(violatesHardSpacing(sameFamily, [first])).toBe(true);
    expect(violatesHardSpacing(sameTemplate, [first])).toBe(true);
    expect(violatesHardSpacing(different, [first])).toBe(false);
  });

  it("scores seen, repeated, overlapping, and over-target candidates with higher penalties", () => {
    const recent = buildQuestionProfile(makeRow({ sourceOrder: 0, sourcePercentile: getSourcePercentile(0, 15), sourceBand: "start" }));
    const freshDifferent = buildQuestionProfile(
      makeRow({
        slug: "sports-nba-finals",
        question: "Who won the NBA Finals in 1998?",
        category: "Sports",
        sourceOrder: 8,
        sourcePercentile: getSourcePercentile(8, 15),
        sourceBand: "middle",
      })
    );
    const overlapping = buildQuestionProfile(
      makeRow({
        slug: "history-president-washington-2",
        question: "What year did George Washington leave office?",
        sourceOrder: 1,
        sourcePercentile: getSourcePercentile(1, 15),
        sourceBand: "start",
      })
    );
    const state = {
      recentProfiles: [recent],
      bandCounts: { ...createEmptyBandCounts(), start: 5 },
      targetBandCounts: buildBandTargets(15),
    };

    expect(scoreCandidate(overlapping, state, false)).toBeGreaterThan(scoreCandidate(freshDifferent, state, false));
    expect(scoreCandidate(freshDifferent, state, true)).toBeGreaterThan(scoreCandidate(freshDifferent, state, false));
  });
});
