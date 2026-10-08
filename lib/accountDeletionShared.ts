// Shared by the player "Delete my account" page and POST /api/account/delete (native app store
// plan Phase 1b). Plain data — safe for client and server.

/** The word a player types to confirm. The route re-checks it (trimmed, case-insensitive). */
export const DELETE_CONFIRMATION_WORD = "DELETE";

/** The signed-in player's deletion page (game host). The public explainer is /delete-account. */
export const PLAYER_DELETE_ACCOUNT_PATH = "/account/delete";
