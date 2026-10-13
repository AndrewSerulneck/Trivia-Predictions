# Speed Trivia Phase 1 private backup record

Date: **2026-10-12, America/New_York**. All production operations were read-only; **zero mutations**. No player identities or raw player/game/answer records were exported. Full question content and SQL/log evidence remain private.

## Locations and verified checksums

Run ID: **`2026-10-13T02-56-30-977Z`**.

Working capture:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z/
```

Compressed workspace archive and checksum:

```text
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z.tar.gz
/Users/andrewserulneck/Documents/Trivia-Predictions/tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z.tar.gz.sha256
```

Durable copy outside the repository's temporary directory:

```text
/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/2026-10-13T02-56-30-977Z.tar.gz
/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/2026-10-13T02-56-30-977Z.tar.gz.sha256
```

- Archive bytes: **5,059,753**.
- Archive SHA-256 (both copies): **`e01970f67185121c6f91a968f11335ab9eb56707e52e3074022b96b3fff9fb3a`**.
- Full artifact inventory SHA-256: **`d3d848a2a2a02f2021925659580b22f503198e82e91061052eb979a7ef99551f`**.
- `artifact-inventory.json` indexes **65 private files / 28,372,314 bytes**, excluding itself and its checksum (67 files in the archive including those two).
- Primary `speed-questions.json`: **13,801 full rows**, SHA-256 **`48b4f0a58866ffc49d6b7b836fcac748c3a85145fcc4438db0b8b280d771b2b1`**.
- Snapshot revision **`bf59e8249cba428662dd8c33e50b61c1`**; timestamp **2026-10-13T02:56:31.683326Z** (October 12, 10:56:31 PM EDT).

Directories were restricted to 0700 and capture/archive files to 0600. `git check-ignore` confirmed the workspace capture and archive are excluded. Network read access and the explicit durable-copy write were allowed through the automatic sandbox review; no action was rejected. No new cloud backup destination/account/subscription was used.

## What is backed up

The immutable primary manifest has 9 files: installed schema and query text; ordered MVCC snapshot pages and query text; complete Speed row array; FK aggregate counts/query; independent post-capture revision/count query/result. Manifest and its SHA-256 are also included.

Supplemental artifacts include per-question aggregate dependency counts and query; non-FK seen counts; installed defaults/pool counts/extensions; bounded statement history and all 36 matching DML shapes; six-family real rows/IDs/answers; evaluation provenance/curation source/frozen fixture; isolated-pair legacy baseline and traffic calculations; GitHub workflow metadata, 14 run/job/log captures, newest observed generation/import source; and validation facts. The full artifact inventory lists every filename/hash/byte length. Raw logs were not printed or committed.

No `.env.local`, credential values, token file, database connection string, player account, player answer, or production write/undo log was included. The two deleted Speed rows remain present. Live questions were not exported as content; only shared schema and pool/reference aggregates were read.

## Recovery test

The durable archive was actually reopened and extracted into a fresh private directory, not merely copied. Every one of the 65 indexed artifacts passed SHA-256/byte validation. The recovered primary backup verifier passed all 9 file checks, row equality, **13,801 rows / 56 pages**, and revision checks.

Temporary recovery evidence location (ephemeral, not the durable copy):

```text
/private/tmp/speed-trivia-phase1-restore-f32x9a_5/2026-10-13T02-56-30-977Z/
```

Exact verification commands:

```sh
node scripts/audit-speed-trivia-inventory.cjs --verify tmp/speed-trivia-uniqueness-private/2026-10-13T02-56-30-977Z
node scripts/audit-speed-trivia-inventory.cjs --verify /private/tmp/speed-trivia-phase1-restore-f32x9a_5/2026-10-13T02-56-30-977Z
shasum -a 256 '/Users/andrewserulneck/Library/Application Support/HightopChallenge/private-backups/speed-trivia/2026-10-13T02-56-30-977Z.tar.gz'
```

This is a verified **persistent local** copy independent of repository temp cleanup. It is on the same Mac: off-device recovery, Time Machine/iCloud inclusion, and survival of disk loss are **not verified**. Before Phase 4/5 production mutation, take the required fresh drift-checked backup and verify a durable off-device/private recovery destination. Do not infer disaster-recovery coverage from the ignored `tmp` directory or this same-disk copy. No off-device transfer was authorized/performed in Phase 1.

The archive is immutable evidence of Phase 1, not a ready-to-run restoration script. Later undo must use applied before/after logs, expected hashes/status/revisions, and recheck uniqueness against current keepers. No restoring old duplicate content or broad DB overwrite is authorized by this backup.
