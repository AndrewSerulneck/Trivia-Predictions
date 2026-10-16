// Errors every Results read may throw (docs/partner-results-page-plan.md §5e). Pure. The route gate
// (lib/ownerHistoryRoute.ts, withOwnerVenue) turns them into a 404 / 503; lib/ownerHistory.ts
// re-exports them under their older Game Results names.

/** A read this page needs isn't deployed yet (a missing RPC): the route answers 503. */
export class ResultsUnavailableError extends Error {}
/** The game / reward isn't this venue's (or doesn't exist): the route answers 404. */
export class ResultsNotFoundError extends Error {}
