import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import {
  findOccurrencesToSeed,
  getOccurrenceReadiness,
  seedOccurrenceQuestions,
} from "@/lib/liveShowdownEngine";

// Narrow window: verify cron only checks games starting within 2 hours so it
// doesn't do the nightly cron's job and mask nightly-cron failures.
const VERIFY_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

type OccurrenceVerifyReport = {
  scheduleId: string;
  occurrenceDate: string;
  venueId: string;
  seededCount: number;
  expectedCount: number;
  ready: boolean;
  selfHealed: boolean;
  error?: string;
};

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  const targets = await findOccurrencesToSeed(Date.now(), VERIFY_LOOKAHEAD_MS).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Failed to load seeding targets.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  });

  // findOccurrencesToSeed returned a Response only when it threw — propagate it.
  if (targets instanceof NextResponse) return targets;

  const reports: OccurrenceVerifyReport[] = [];
  let anyDeficient = false;

  for (const target of targets) {
    const report: OccurrenceVerifyReport = {
      scheduleId: target.scheduleId,
      occurrenceDate: target.occurrenceDate,
      venueId: target.venueId,
      seededCount: 0,
      expectedCount: 0,
      ready: false,
      selfHealed: false,
    };

    try {
      // Pre-check: see if this occurrence already has enough questions.
      const before = await getOccurrenceReadiness(
        target.scheduleId,
        target.occurrenceDate,
        target.numRounds
      );

      if (!before.ready) {
        // Self-heal: attempt to seed the missing questions.
        const seedResult = await seedOccurrenceQuestions(
          target.scheduleId,
          target.occurrenceDate,
          target.venueId,
          target.numRounds
        );
        if (seedResult.seeded > 0) {
          report.selfHealed = true;
          console.warn(
            `[verify-live-trivia-coverage] self-healed ${seedResult.seeded} questions for ` +
              `schedule=${target.scheduleId} occurrence=${target.occurrenceDate} venue=${target.venueId}`
          );
        }

        // Post-check: verify coverage after self-heal attempt.
        const after = await getOccurrenceReadiness(
          target.scheduleId,
          target.occurrenceDate,
          target.numRounds
        );
        report.seededCount = after.seededCount;
        report.expectedCount = after.expectedCount;
        report.ready = after.ready;
        if (after.seededCount === 0) {
          // Completely unseeded — the game cannot run at all.
          anyDeficient = true;
          console.error(
            `[verify-live-trivia-coverage] DEFICIENT after self-heal: ` +
              `schedule=${target.scheduleId} occurrence=${target.occurrenceDate} venue=${target.venueId} ` +
              `seeded=${after.seededCount}/${after.expectedCount}`
          );
        } else if (!after.ready) {
          // Partial fill: idempotency guard prevented re-seeding (pool exhaustion).
          // Game will run with reduced content — warn but don't trigger an error.
          console.warn(
            `[verify-live-trivia-coverage] partial fill (pool exhaustion): ` +
              `schedule=${target.scheduleId} occurrence=${target.occurrenceDate} venue=${target.venueId} ` +
              `seeded=${after.seededCount}/${after.expectedCount}`
          );
        }
      } else {
        report.seededCount = before.seededCount;
        report.expectedCount = before.expectedCount;
        report.ready = true;
      }
    } catch (err) {
      report.error = err instanceof Error ? err.message : "Unknown error";
      anyDeficient = true;
      console.error(
        `[verify-live-trivia-coverage] error for schedule=${target.scheduleId} occurrence=${target.occurrenceDate}:`,
        report.error
      );
    }

    reports.push(report);
  }

  const status = anyDeficient ? 500 : 200;
  return NextResponse.json({ ok: !anyDeficient, reports }, { status });
}

export async function GET(request: Request) {
  return POST(request);
}
