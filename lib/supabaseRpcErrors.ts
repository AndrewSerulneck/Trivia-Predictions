/** A Supabase / PostgREST error, as `.rpc()` returns it. */
export type RpcErrorLike = { code?: string; message?: string };

/**
 * Is this `.rpc()` error "the function does not exist yet" — the app deployed before its migration?
 * PostgREST answers a function missing from its schema cache with `PGRST202`; Postgres itself answers
 * `42883` (undefined_function). With `name`, an error whose message names the function also counts
 * (older PostgREST versions and test doubles carry no code).
 *
 * Callers use it only to choose a log line: every caller FAILS CLOSED on any RPC error, missing or not.
 */
export const isMissingFunction = (error: RpcErrorLike | null | undefined, name?: string): boolean => {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return Boolean(name) && String(error.message ?? "").includes(name as string);
};
