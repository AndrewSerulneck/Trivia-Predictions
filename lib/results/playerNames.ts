import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// user id → username for the Results page and the older Game Results reads. One `in()` read per
// USERNAME_CHUNK ids (a page's winners, or one game's scorers): a full standings list can hold
// hundreds of ids, and one `in()` over them all would pass PostgREST's URL limit (~8 KB ≈ 200
// UUIDs). A deleted player simply has no entry, and the caller shows "Deleted player". The ids
// never leave the server.

export const USERNAME_CHUNK = 100;

export const loadUsernames = async (userIds: Iterable<string | null>): Promise<Map<string, string>> => {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const db = supabaseAdmin;
  if (!db) throw new Error("Supabase admin client is not configured.");
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += USERNAME_CHUNK) chunks.push(ids.slice(i, i + USERNAME_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      db.from("users").select("id, username").in("id", chunk).returns<Array<{ id: string; username: string | null }>>(),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw new Error(error.message ?? "Failed to load player names.");
    for (const row of data ?? []) if (row.username) names.set(row.id, row.username);
  }
  return names;
};
