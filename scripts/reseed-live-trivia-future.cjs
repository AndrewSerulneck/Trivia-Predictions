#!/usr/bin/env node

const DEFAULT_LOOKAHEAD_DAYS = 14;

function parseArgs(argv) {
  const args = {
    apply: false,
    lookaheadDays: DEFAULT_LOOKAHEAD_DAYS,
    venueId: "",
    limit: 100,
    includeStarted: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.apply = true;
    } else if (token === "--days" || token === "--lookahead-days") {
      args.lookaheadDays = Math.max(1, Math.floor(Number(argv[index + 1] ?? DEFAULT_LOOKAHEAD_DAYS)));
      index += 1;
    } else if (token === "--venue-id") {
      args.venueId = String(argv[index + 1] ?? "").trim();
      index += 1;
    } else if (token === "--limit") {
      args.limit = Math.max(1, Math.floor(Number(argv[index + 1] ?? 100)));
      index += 1;
    } else if (token === "--include-started") {
      args.includeStarted = true;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node --env-file=.env.local --conditions react-server --import tsx scripts/reseed-live-trivia-future.cjs [options]

Options:
  --apply                 Write repairs. Omit for dry-run.
  --days <number>         Lookahead window in days. Default: ${DEFAULT_LOOKAHEAD_DAYS}
  --venue-id <id>         Restrict to one venue.
  --limit <number>        Max future occurrences to inspect. Default: 100
  --include-started       Include occurrences whose start time has passed.
`);
}

function formatTarget(target) {
  return `${target.venueId} ${target.scheduleId} ${target.occurrenceDate}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowMs = Date.now();
  const lookaheadMs = args.lookaheadDays * 24 * 60 * 60 * 1000;
  const {
    findOccurrencesToSeed,
    reseedOccurrenceQuestionsForFreshness,
  } = await import("../lib/liveShowdownEngine.ts");

  const targets = (await findOccurrencesToSeed(nowMs, lookaheadMs))
    .filter((target) => !args.venueId || target.venueId === args.venueId)
    .filter((target) => args.includeStarted || target.startMs > nowMs)
    .slice(0, args.limit);

  const reports = [];
  for (const target of targets) {
    const report = await reseedOccurrenceQuestionsForFreshness({
      scheduleId: target.scheduleId,
      occurrenceDate: target.occurrenceDate,
      venueId: target.venueId,
      numRounds: target.numRounds,
      apply: args.apply,
    });
    reports.push({ target, report });

    const marker = report.applied ? "APPLIED" : report.reason.startsWith("Dry run") ? "AVAILABLE" : "SKIPPED";
    console.log(
      `[${marker}] ${formatTarget(target)} oldSeen=${report.oldUsedSeen} newSeen=${report.newUsedSeen} ` +
        `old=${report.oldQuestionIds.length} new=${report.newQuestionIds.length} :: ${report.reason}`
    );
  }

  const summary = reports.reduce(
    (acc, entry) => {
      acc.checked += entry.report.checked ? 1 : 0;
      acc.available += entry.report.reason.startsWith("Dry run") ? 1 : 0;
      acc.applied += entry.report.applied ? 1 : 0;
      acc.skipped += !entry.report.applied && !entry.report.reason.startsWith("Dry run") ? 1 : 0;
      acc.replaced += entry.report.replacedCount;
      acc.removedSeen += entry.report.removedSeenCount;
      return acc;
    },
    { targets: targets.length, checked: 0, available: 0, applied: 0, skipped: 0, replaced: 0, removedSeen: 0 }
  );

  console.log("[reseed-live-trivia-future] Summary", JSON.stringify(summary, null, 2));
  if (!args.apply && summary.available > 0) {
    console.log("[reseed-live-trivia-future] Dry run only. Re-run with --apply to write repairs.");
  }
}

main().catch((error) => {
  console.error("[reseed-live-trivia-future] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
