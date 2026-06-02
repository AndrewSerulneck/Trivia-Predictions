import { NextResponse } from "next/server";
import { findOccurrencesToSeed, seedOccurrenceQuestions } from "@/lib/liveShowdownEngine";

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

type SeedReport = {
  scheduleId: string;
  occurrenceDate: string;
  venueId: string;
  seeded: number;
  skipped: number;
  error?: string;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const targets = await findOccurrencesToSeed(Date.now());
    const seeded: SeedReport[] = [];

    for (const target of targets) {
      try {
        const result = await seedOccurrenceQuestions(
          target.scheduleId,
          target.occurrenceDate,
          target.venueId,
          target.numRounds
        );
        seeded.push({
          scheduleId: target.scheduleId,
          occurrenceDate: target.occurrenceDate,
          venueId: target.venueId,
          seeded: result.seeded,
          skipped: result.skipped,
        });
      } catch (error) {
        // Don't let one bad schedule abort seeding for the rest.
        seeded.push({
          scheduleId: target.scheduleId,
          occurrenceDate: target.occurrenceDate,
          venueId: target.venueId,
          seeded: 0,
          skipped: 0,
          error: error instanceof Error ? error.message : "Failed to seed occurrence.",
        });
      }
    }

    return NextResponse.json({ ok: true, seeded });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron seeding failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
