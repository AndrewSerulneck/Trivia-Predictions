#!/usr/bin/env node
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BDL_BASE = String(process.env.BALLDONTLIE_API_BASE_URL || "https://api.balldontlie.io").trim().replace(/\/+$/, "");
const BDL_KEY = String(process.env.BALLDONTLIE_API_KEY || "").trim();

function isPlaceholderFighterName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || /^fighter\s+\d+$/.test(normalized) || /^player\s+\d+$/.test(normalized);
}

function toDisplayName(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value;
}

function extractNameFromFighter(payload) {
  if (!payload || typeof payload !== "object") return "";
  const first = String(payload.first_name || "").trim();
  const last = String(payload.last_name || "").trim();
  const combined = `${first} ${last}`.trim();
  const direct = String(payload.name || "").trim();
  return toDisplayName(combined || direct);
}

async function fetchBdlJson(path) {
  const response = await fetch(`${BDL_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: BDL_KEY,
    },
  });
  if (!response.ok) {
    throw new Error(`BDL request failed (${response.status}) for ${path}`);
  }
  return response.json();
}

async function resolveFighterNameById(fighterId, cache) {
  const id = Number.parseInt(String(fighterId || ""), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (cache.has(id)) return cache.get(id);

  let resolved = null;
  try {
    const payload = await fetchBdlJson(`/mma/v1/fighters/${id}`);
    resolved = extractNameFromFighter(payload?.data);
  } catch {
    resolved = null;
  }

  if (!resolved) {
    try {
      const query = new URLSearchParams({ per_page: "25" });
      query.append("fighter_ids[]", String(id));
      query.append("fighter_ids", String(id));
      const payload = await fetchBdlJson(`/mma/v1/fighters?${query.toString()}`);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const exact = rows.find((row) => Number.parseInt(String(row?.id ?? ""), 10) === id);
      resolved = extractNameFromFighter(exact);
    } catch {
      resolved = null;
    }
  }

  const finalName = resolved && !isPlaceholderFighterName(resolved) ? resolved : null;
  cache.set(id, finalName);
  return finalName;
}

function normalizeLineup(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const row = { ...item };
    const playerId = Number.parseInt(String(row.player_id ?? row.playerId ?? ""), 10);
    const playerName = String(row.player_name ?? row.playerName ?? "").trim();
    return { row, playerId, playerName };
  });
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!BDL_KEY) {
    throw new Error("Missing BALLDONTLIE_API_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fighterNameCache = new Map();
  const pageSize = 500;
  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let placeholderSlots = 0;
  let resolvedSlots = 0;
  let unresolvedSlots = 0;

  while (true) {
    const { data, error } = await supabase
      .from("fantasy_entries")
      .select("id, lineup, sport_key, created_at")
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`fantasy_entries page failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      scanned += 1;
      const parsed = normalizeLineup(entry.lineup);
      if (parsed.length === 0) continue;

      let needsUpdate = false;
      const nextLineup = Array.isArray(entry.lineup) ? [...entry.lineup] : [];
      for (let i = 0; i < parsed.length; i += 1) {
        const slot = parsed[i];
        if (!slot) continue;
        if (!Number.isFinite(slot.playerId) || slot.playerId <= 0) continue;
        if (!isPlaceholderFighterName(slot.playerName)) continue;

        placeholderSlots += 1;
        const resolvedName = await resolveFighterNameById(slot.playerId, fighterNameCache);
        if (!resolvedName) {
          unresolvedSlots += 1;
          continue;
        }

        resolvedSlots += 1;
        needsUpdate = true;
        const existing = nextLineup[i];
        if (existing && typeof existing === "object" && !Array.isArray(existing)) {
          const patched = { ...existing, player_name: resolvedName };
          if ("playerName" in patched) {
            patched.playerName = resolvedName;
          }
          nextLineup[i] = patched;
        }
      }

      if (!needsUpdate) continue;
      const { error: updateError } = await supabase
        .from("fantasy_entries")
        .update({ lineup: nextLineup })
        .eq("id", entry.id);
      if (updateError) {
        throw new Error(`update failed for ${entry.id}: ${updateError.message}`);
      }
      updated += 1;
    }

    offset += data.length;
    if (data.length < pageSize) break;
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        updated,
        placeholderSlots,
        resolvedSlots,
        unresolvedSlots,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

