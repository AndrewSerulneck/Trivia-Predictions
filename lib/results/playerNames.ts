import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// user id → username for the Results page and the older Game Results reads. One `in()` read over
// the ids given (a page's winners, or one game's scorers). A deleted player simply has no entry, and
// the caller shows "Deleted player". The ids never leave the server.

export const loadUsernames = async (userIds: Iterable<string | null>): Promise<Map<string, string>> => {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .in("id", ids)
    .returns<Array<{ id: string; username: string | null }>>();
  if (error) throw new Error(error.message ?? "Failed to load player names.");
  for (const row of data ?? []) if (row.username) names.set(row.id, row.username);
  return names;
};
