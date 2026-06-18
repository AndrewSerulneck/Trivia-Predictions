import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getLiveShowdownState: vi.fn(),
  gradeWriteInAnswerWithVariants: vi.fn(),
  trackLiveShowdownQuestionExposure: vi.fn(),
  applyChallengeCampaignPoints: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@/lib/liveShowdownEngine", () => ({
  getLiveShowdownState: mocks.getLiveShowdownState,
}));

vi.mock("@/lib/liveShowdownGrading", () => ({
  gradeWriteInAnswerWithVariants: mocks.gradeWriteInAnswerWithVariants,
  normalizeWriteInForStorage: (value: string) => String(value ?? "").trim().toLowerCase(),
}));

vi.mock("@/lib/liveShowdown", () => ({
  trackLiveShowdownQuestionExposure: mocks.trackLiveShowdownQuestionExposure,
}));

vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: mocks.applyChallengeCampaignPoints,
}));

import { submitLiveShowdownAnswer } from "@/lib/liveShowdownSubmission";

function makeQuery<T>(result: T) {
  const query = {
    ...result,
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("submitLiveShowdownAnswer", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.getLiveShowdownState.mockReset();
    mocks.gradeWriteInAnswerWithVariants.mockReset();
    mocks.trackLiveShowdownQuestionExposure.mockReset();
    mocks.applyChallengeCampaignPoints.mockReset();
  });

  it("uses the server's active schedule slot when the client submits a stale schedule id", async () => {
    const insertedRows: Array<Record<string, unknown>> = [];

    mocks.getLiveShowdownState.mockResolvedValue({
      isGameActive: true,
      scheduleId: "schedule-active",
      scheduleTitle: "Live Showdown",
      scheduleTimezone: "America/New_York",
      scheduleStartTime: "2026-06-17T23:00:00.000Z",
      occurrenceDate: "2026-06-17",
      intermissionAdDelaySeconds: 10,
      lobbyAdEnabled: true,
      venueName: "Test Venue",
      totalRounds: 3,
      currentRound: 2,
      currentQuestionIndex: 7,
      activePhase: "answering",
      secondsRemaining: 20,
      activeQuestion: null,
      revealedAnswer: null,
      emceeAnnouncement: null,
      viewerResult: null,
      isFinalResultsWindow: false,
      currentRoundCategory: null,
      upcomingRoundNumber: 3,
      upcomingRoundCategory: null,
      leaderboard: null,
      viewerRank: null,
      viewerRoundByRound: null,
    });
    mocks.gradeWriteInAnswerWithVariants.mockResolvedValue(false);
    mocks.trackLiveShowdownQuestionExposure.mockResolvedValue(undefined);
    mocks.applyChallengeCampaignPoints.mockResolvedValue(null);

    mocks.from.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => makeQuery({ data: { venue_id: "venue-1" }, error: null })),
        };
      }

      if (table === "trivia_schedules") {
        return {
          select: vi.fn(() => makeQuery({ data: { venue_id: "venue-1" }, error: null })),
        };
      }

      if (table === "trivia_session_questions") {
        return {
          select: vi.fn(() => makeQuery({ data: { question_id: "question-slug" }, error: null })),
        };
      }

      if (table === "trivia_questions") {
        return {
          select: vi.fn(() =>
            makeQuery({
              data: {
                id: "question-db-id",
                slug: "question-slug",
                options: ["Correct Answer"],
                correct_answer: 0,
                question_pool: "live_showdown",
              },
              error: null,
            })
          ),
        };
      }

      if (table === "live_showdown_answers") {
        return {
          select: vi.fn(() => makeQuery({ data: null, error: null })),
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRows.push(row);
            return { error: null };
          }),
          update: vi.fn(() => makeQuery({ error: null })),
        };
      }

      if (table === "user_seen_questions") {
        return {
          upsert: vi.fn(() => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      submitLiveShowdownAnswer({
        userId: "user-1",
        venueId: "venue-1",
        scheduleId: "schedule-stale",
        roundNumber: 2,
        questionIndex: 7,
        submittedAnswer: "Wrong Answer",
      })
    ).resolves.toMatchObject({
      accepted: true,
      alreadySubmitted: false,
      isCorrect: false,
    });

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      schedule_id: "schedule-active",
      occurrence_date: "2026-06-17",
      round_number: 2,
      question_index: 7,
      submitted_answer: "Wrong Answer",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Client slot mismatch ignored")
    );

    warnSpy.mockRestore();
  });
});
