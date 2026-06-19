#!/usr/bin/env node
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MIN_RADIUS = 500;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "hightop-venue-audit/1.0" } });
    const json = await res.json();
    return json.display_name || "(no result)";
  } catch {
    return "(geocode error)";
  }
}

async function main() {
  const { data: venues, error } = await supabase
    .from("venues")
    .select("id, name, address, latitude, longitude, radius")
    .order("name");

  if (error) {
    console.error("Failed to fetch venues:", error.message);
    process.exit(1);
  }

  if (!venues || venues.length === 0) {
    console.log("No venues found.");
    return;
  }

  console.log(`\nFound ${venues.length} venue(s)\n`);
  console.log("=".repeat(80));

  const issues = [];

  for (const v of venues) {
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    const radius = Number(v.radius);
    const venueIssues = [];

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      venueIssues.push("MISSING or INVALID coordinates");
    } else {
      if (lat < -90 || lat > 90) venueIssues.push(`Latitude out of range: ${lat}`);
      if (lng < -180 || lng > 180) venueIssues.push(`Longitude out of range: ${lng}`);
      if (lat === 0 && lng === 0) venueIssues.push("Coordinates are 0,0 (likely unset)");
    }

    if (!radius || isNaN(radius) || radius <= 0) {
      venueIssues.push("MISSING or INVALID radius");
    } else if (radius < MIN_RADIUS) {
      venueIssues.push(`Radius ${radius}m is below the 500m minimum floor (system will auto-enforce 500m)`);
    }

    const geocodedAddress = (lat && lng && !venueIssues.some(i => i.includes("MISSING")))
      ? await reverseGeocode(lat, lng)
      : null;

    const status = venueIssues.length === 0 ? "✅ OK" : "⚠️  ISSUES";
    console.log(`\n${status}  ${v.name}`);
    console.log(`   ID:       ${v.id}`);
    console.log(`   Address:  ${v.address || "(none stored)"}`);
    console.log(`   Coords:   ${lat}, ${lng}`);
    console.log(`   Radius:   ${radius}m (effective: ${Math.max(radius, MIN_RADIUS)}m)`);
    if (geocodedAddress) {
      console.log(`   Geocoded: ${geocodedAddress}`);
    }
    if (venueIssues.length > 0) {
      venueIssues.forEach((i) => console.log(`   ❌ ${i}`));
      issues.push({ name: v.name, issues: venueIssues });
    }
  }

  console.log("\n" + "=".repeat(80));
  if (issues.length === 0) {
    console.log(`\n✅ All ${venues.length} venue(s) look good. Safe to enable geofencing.\n`);
  } else {
    console.log(`\n⚠️  ${issues.length} venue(s) have issues that need fixing before enabling geofencing:\n`);
    issues.forEach(({ name, issues: list }) => {
      console.log(`  • ${name}: ${list.join("; ")}`);
    });
    console.log();
  }
}

main();
