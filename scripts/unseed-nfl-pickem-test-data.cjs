// Removes all NFL Pick 'Em test data created by seed-nfl-pickem-test-data.cjs:
// the flag file, the reserved-range (997-999) nfl_pickem_weeks rows (cascades
// nfl_pickem_user_weeks), and the nflsim_-prefixed users (cascades
// pickem_picks + nfl_pickem_user_weeks) plus their auth.users rows.
//
// Safe to run twice.
//
// Run: node --env-file=.env.local scripts/unseed-nfl-pickem-test-data.cjs

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const FLAG_PATH = path.join(__dirname, "..", ".nfl-pickem-test-data");
const RESERVED_WEEK_NUMBERS = [996, 997, 998, 999];

function getDb() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key);
}

async function main() {
  const db = getDb();

  if (fs.existsSync(FLAG_PATH)) {
    fs.unlinkSync(FLAG_PATH);
    console.log(`Removed flag file: ${FLAG_PATH}`);
  } else {
    console.log("Flag file already absent.");
  }

  const { data: simUsers, error: findError } = await db.from("users").select("id, auth_id, username").ilike("username", "nflsim_%");
  if (findError) {
    throw new Error(`Failed to look up nflsim_ users: ${findError.message}`);
  }

  if (simUsers && simUsers.length > 0) {
    const { error: deleteUsersError } = await db
      .from("users")
      .delete()
      .in("id", simUsers.map((u) => u.id));
    if (deleteUsersError) {
      throw new Error(`Failed to delete nflsim_ users (cascades picks/user-weeks): ${deleteUsersError.message}`);
    }
    for (const user of simUsers) {
      if (user.auth_id) {
        await db.auth.admin.deleteUser(user.auth_id).catch(() => undefined);
      }
    }
    console.log(`Removed ${simUsers.length} nflsim_ users (username, auth.users, pickem_picks, nfl_pickem_user_weeks).`);
  } else {
    console.log("No nflsim_ users found.");
  }

  const { error: weeksError } = await db
    .from("nfl_pickem_weeks")
    .delete()
    .in("week_number", RESERVED_WEEK_NUMBERS);
  if (weeksError) {
    throw new Error(`Failed to delete test nfl_pickem_weeks rows (week_number in ${RESERVED_WEEK_NUMBERS.join(",")}): ${weeksError.message}`);
  }

  console.log(`Removed test nfl_pickem_weeks rows (week_number in ${RESERVED_WEEK_NUMBERS.join(", ")}).`);
  console.log("NFL Pick 'Em test data fully removed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
