import { NextResponse } from "next/server";
import {
  findOccurrencesToSeed,
  getOccurrenceReadiness,
  seedOccurrenceQuestions,
} from "@/lib/liveShowdownEngine";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) {
      return true;
    }
    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }
  return false;
}

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
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  const targets = await findOccurrencesToSeed(Date.now()).catch((err: unknown) => {
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
      }

      // Post-check: verify coverage after any self-heal attempt.
      const after = await getOccurrenceReadiness(
        target.scheduleId,
        target.occurrenceDate,
        target.numRounds
      );
      report.seededCount = after.seededCount;
      report.expectedCount = after.expectedCount;
      report.ready = after.ready;
      if (!after.ready) {
        anyDeficient = true;
        console.error(
          `[verify-live-trivia-coverage] DEFICIENT after self-heal: ` +
            `schedule=${target.scheduleId} occurrence=${target.occurrenceDate} venue=${target.venueId} ` +
            `seeded=${after.seededCount}/${after.expectedCount}`
        );
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
