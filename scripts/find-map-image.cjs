#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/find-map-image.cjs "Texas"
 *   node scripts/find-map-image.cjs "France"
 *   node scripts/find-map-image.cjs --list-states
 *   node scripts/find-map-image.cjs --list-countries
 *
 * Queries the Wikimedia Commons API to find a locator map for a US state or
 * country, then prints a ready-to-paste JSON question entry for geography.v1.json.
 * Tables are also exported for use by generate-map-questions.cjs.
 */

// ---------------------------------------------------------------------------
// Lookup tables — Wikimedia Commons SVG filenames for locator maps
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const US_STATE_FILES = {
  "Alabama":        "Alabama_in_United_States.svg",
  "Alaska":         "Alaska_in_United_States.svg",
  "Arizona":        "Arizona_in_United_States.svg",
  "Arkansas":       "Arkansas_in_United_States.svg",
  "California":     "California_in_United_States.svg",
  "Colorado":       "Colorado_in_United_States.svg",
  "Connecticut":    "Connecticut_in_United_States_(zoom).svg",
  "Delaware":       "Delaware_in_United_States_(zoom).svg",
  "Florida":        "Florida_in_United_States.svg",
  "Georgia":        "Georgia_in_United_States.svg",
  "Hawaii":         "Hawaii_in_United_States_(zoom).svg",
  "Idaho":          "Idaho_in_United_States.svg",
  "Illinois":       "Illinois_in_United_States.svg",
  "Indiana":        "Indiana_in_United_States.svg",
  "Iowa":           "Iowa_in_United_States.svg",
  "Kansas":         "Kansas_in_United_States.svg",
  "Kentucky":       "Kentucky_in_United_States.svg",
  "Louisiana":      "Louisiana_in_United_States.svg",
  "Maine":          "Maine_in_United_States.svg",
  "Maryland":       "Maryland_in_United_States_(zoom).svg",
  "Massachusetts":  "Massachusetts_in_United_States.svg",
  "Michigan":       "Michigan_in_United_States.svg",
  "Minnesota":      "Minnesota_in_United_States.svg",
  "Mississippi":    "Mississippi_in_United_States.svg",
  "Missouri":       "Missouri_in_United_States.svg",
  "Montana":        "Montana_in_United_States.svg",
  "Nebraska":       "Nebraska_in_United_States.svg",
  "Nevada":         "Nevada_in_United_States.svg",
  "New Hampshire":  "New_Hampshire_in_United_States_(zoom).svg",
  "New Jersey":     "New_Jersey_in_United_States_(zoom).svg",
  "New Mexico":     "New_Mexico_in_United_States.svg",
  "New York":       "New_York_in_United_States.svg",
  "North Carolina": "North_Carolina_in_United_States.svg",
  "North Dakota":   "North_Dakota_in_United_States.svg",
  "Ohio":           "Ohio_in_United_States.svg",
  "Oklahoma":       "Oklahoma_in_United_States.svg",
  "Oregon":         "Oregon_in_United_States.svg",
  "Pennsylvania":   "Pennsylvania_in_United_States.svg",
  "Rhode Island":   "Rhode_Island_in_United_States.svg",
  "South Carolina": "South_Carolina_in_United_States.svg",
  "South Dakota":   "South_Dakota_in_United_States.svg",
  "Tennessee":      "Tennessee_in_United_States.svg",
  "Texas":          "Texas_in_United_States.svg",
  "Utah":           "Utah_in_United_States.svg",
  "Vermont":        "Vermont_in_United_States_(zoom).svg",
  "Virginia":       "Virginia_in_United_States.svg",
  "Washington":     "Washington_in_United_States.svg",
  "West Virginia":  "West_Virginia_in_United_States.svg",
  "Wisconsin":      "Wisconsin_in_United_States.svg",
  "Wyoming":        "Wyoming_in_United_States.svg",
};

/** @type {Record<string, string>} */
const COUNTRY_FILES = {
  // European countries use the "{Country} in Europe (-rivers -mini map).svg" pattern —
  // zoomed regional view, better for identifying small countries.
  // Non-European countries use "{Country}_(orthographic_projection).svg".
  // ── Europe ──────────────────────────────────────────────────────────────────
  // All use orthographic projection (globe centered on the country).
  // Greece, Luxembourg, Moldova, Slovenia have no orthographic on Wikimedia — kept on European mini map.
  "Albania":                   "Albania_(orthographic_projection).svg",
  "Austria":                   "Austria_(orthographic_projection).svg",
  "Belarus":                   "Belarus_(orthographic_projection).svg",
  "Belgium":                   "Belgium_(orthographic_projection).svg",
  "Bosnia and Herzegovina":    "Bosnia_and_Herzegovina_(orthographic_projection).svg",
  "Bulgaria":                  "Bulgaria_(orthographic_projection).svg",
  "Croatia":                   "Croatia_(orthographic_projection).svg",
  "Czech Republic":            "Czech_Republic_(orthographic_projection).svg",
  "Denmark":                   "Denmark_(orthographic_projection).svg",
  "Estonia":                   "Estonia_(orthographic_projection).svg",
  "Finland":                   "Finland_(orthographic_projection).svg",
  "France":                    "France_(orthographic_projection).svg",
  "Germany":                   "Germany_(orthographic_projection).svg",
  "Greece":                    "Greece in Europe (-rivers -mini map).svg",
  "Hungary":                   "Hungary_(orthographic_projection).svg",
  "Ireland":                   "Ireland_(orthographic_projection).svg",
  "Italy":                     "Italy_(orthographic_projection).svg",
  "Latvia":                    "Latvia_(orthographic_projection).svg",
  "Lithuania":                 "Lithuania_(orthographic_projection).svg",
  "Luxembourg":                "Luxembourg in Europe (-rivers -mini map).svg",
  "Moldova":                   "Moldova in Europe (-rivers -mini map).svg",
  "Montenegro":                "Montenegro_(orthographic_projection).svg",
  "Netherlands":               "Netherlands_(orthographic_projection).svg",
  "North Macedonia":           "North_Macedonia_(orthographic_projection).svg",
  "Norway":                    "Norway_(orthographic_projection).svg",
  "Poland":                    "Poland_(orthographic_projection).svg",
  "Portugal":                  "Portugal_(orthographic_projection).svg",
  "Romania":                   "Romania_(orthographic_projection).svg",
  "Serbia":                    "Serbia_(orthographic_projection).svg",
  "Slovakia":                  "Slovakia_(orthographic_projection).svg",
  "Slovenia":                  "Slovenia in Europe (-rivers -mini map).svg",
  "Spain":                     "Spain_(orthographic_projection).svg",
  "Sweden":                    "Sweden_(orthographic_projection).svg",
  "Switzerland":               "Switzerland_(orthographic_projection).svg",
  "Turkey":                    "Turkey_(orthographic_projection).svg",
  "Ukraine":                   "Ukraine_(orthographic_projection).svg",
  "United Kingdom":            "United_Kingdom_(orthographic_projection).svg",
  // ── Americas ────────────────────────────────────────────────────────────────
  "Argentina":                 "Argentina_(orthographic_projection).svg",
  "Bolivia":                   "Bolivia_(orthographic_projection).svg",
  "Brazil":                    "Brazil_(orthographic_projection).svg",
  "Canada":                    "Canada_(orthographic_projection).svg",
  "Chile":                     "Chile_(orthographic_projection).svg",
  "Colombia":                  "Colombia_(orthographic_projection).svg",
  "Costa Rica":                "Costa_Rica_(orthographic_projection).svg",
  "Cuba":                      "Cuba_(orthographic_projection).svg",
  "Dominican Republic":        "Dominican_Republic_(orthographic_projection).svg",
  "Ecuador":                   "Ecuador_(orthographic_projection).svg",
  "El Salvador":               "El_Salvador_(orthographic_projection).svg",
  "Guatemala":                 "Guatemala_(orthographic_projection).svg",
  "Haiti":                     "Haiti_(orthographic_projection).svg",
  "Honduras":                  "Honduras_(orthographic_projection).svg",
  "Jamaica":                   "Jamaica_(orthographic_projection).svg",
  "Mexico":                    "Mexico_(orthographic_projection).svg",
  "Nicaragua":                 "Nicaragua_(orthographic_projection).svg",
  "Panama":                    "Panama_(orthographic_projection).svg",
  "Paraguay":                  "Paraguay_(orthographic_projection).svg",
  "Peru":                      "Peru_(orthographic_projection).svg",
  "Uruguay":                   "Uruguay_(orthographic_projection).svg",
  "Venezuela":                 "Venezuela_(orthographic_projection).svg",
  // ── Africa ──────────────────────────────────────────────────────────────────
  "Algeria":                   "Algeria_(orthographic_projection).svg",
  "Angola":                    "Angola_(orthographic_projection).svg",
  "Cameroon":                  "Cameroon_(orthographic_projection).svg",
  "Democratic Republic of the Congo": "Democratic_Republic_of_the_Congo_(orthographic_projection).svg",
  "Egypt":                     "Egypt_(orthographic_projection).svg",
  "Ethiopia":                  "Ethiopia_(orthographic_projection).svg",
  "Ghana":                     "Ghana_(orthographic_projection).svg",
  "Kenya":                     "Kenya_(orthographic_projection).svg",
  "Libya":                     "Libya_(orthographic_projection).svg",
  "Madagascar":                "Madagascar_(orthographic_projection).svg",
  "Mali":                      "Mali_(orthographic_projection).svg",
  "Morocco":                   "Morocco_(orthographic_projection).svg",
  "Mozambique":                "Mozambique_(orthographic_projection).svg",
  "Nigeria":                   "Nigeria_(orthographic_projection).svg",
  "Senegal":                   "Senegal_(orthographic_projection).svg",
  "Somalia":                   "Somalia_(orthographic_projection).svg",
  "South Africa":              "South_Africa_(orthographic_projection).svg",
  "Sudan":                     "Sudan_(orthographic_projection).svg",
  "Tanzania":                  "Tanzania_(orthographic_projection).svg",
  "Tunisia":                   "Tunisia_(orthographic_projection).svg",
  "Uganda":                    "Uganda_(orthographic_projection).svg",
  "Zambia":                    "Zambia_(orthographic_projection).svg",
  "Zimbabwe":                  "Zimbabwe_(orthographic_projection).svg",
  // ── Asia & Oceania ──────────────────────────────────────────────────────────
  "Afghanistan":               "Afghanistan_(orthographic_projection).svg",
  "Australia":                 "Australia_(orthographic_projection).svg",
  "Azerbaijan":                "Azerbaijan_(orthographic_projection).svg",
  "Bangladesh":                "Bangladesh_(orthographic_projection).svg",
  "Cambodia":                  "Cambodia_(orthographic_projection).svg",
  "China":                     "China_(orthographic_projection).svg",
  "India":                     "India_(orthographic_projection).svg",
  "Indonesia":                 "Indonesia_(orthographic_projection).svg",
  "Iran":                      "Iran_(orthographic_projection).svg",
  "Iraq":                      "Iraq_(orthographic_projection).svg",
  "Israel":                    "Israel_(orthographic_projection).svg",
  "Japan":                     "Japan_(orthographic_projection).svg",
  "Jordan":                    "Jordan_(orthographic_projection).svg",
  "Kazakhstan":                "Kazakhstan_(orthographic_projection).svg",
  "Laos":                      "Laos_(orthographic_projection).svg",
  "Malaysia":                  "Malaysia_(orthographic_projection).svg",
  "Mongolia":                  "Mongolia_(orthographic_projection).svg",
  "Myanmar":                   "Myanmar_(orthographic_projection).svg",
  "Nepal":                     "Nepal_(orthographic_projection).svg",
  "New Zealand":               "New_Zealand_(orthographic_projection).svg",
  "North Korea":               "North_Korea_(orthographic_projection).svg",
  "Pakistan":                  "Pakistan_(orthographic_projection).svg",
  "Philippines":               "Philippines_(orthographic_projection).svg",
  "Russia":                    "Russia_(orthographic_projection).svg",
  "Saudi Arabia":              "Saudi_Arabia_(orthographic_projection).svg",
  "South Korea":               "South_Korea_(orthographic_projection).svg",
  "Sri Lanka":                 "Sri_Lanka_(orthographic_projection).svg",
  "Syria":                     "Syria_(orthographic_projection).svg",
  "Taiwan":                    "Taiwan_(orthographic_projection).svg",
  "Thailand":                  "Thailand_(orthographic_projection).svg",
  "United Arab Emirates":      "United_Arab_Emirates_(orthographic_projection).svg",
  "Uzbekistan":                "Uzbekistan_(orthographic_projection).svg",
  "Vietnam":                   "Vietnam_(orthographic_projection).svg",
  "Yemen":                     "Yemen_(orthographic_projection).svg",
};

// ---------------------------------------------------------------------------
// Helpers (also used by generate-map-questions.cjs)
// ---------------------------------------------------------------------------

function slugify(name) {
  return "geography-map-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function wikimediaUrl(filename) {
  const urlName = filename.replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(urlName)}?width=800`;
}

async function resolveUrl(filename) {
  try {
    const apiUrl =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent("File:" + filename)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=800` +
      `&format=json&origin=*`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const thumbUrl = page?.imageinfo?.[0]?.thumburl;
    if (thumbUrl) return thumbUrl;
  } catch {
    // fall through
  }
  return wikimediaUrl(filename);
}

function buildQuestion(name, resolvedUrl, type) {
  const isState = type === "state";
  return {
    slug: slugify(name),
    question: isState
      ? "Which U.S. state is shown highlighted on this map?"
      : "Which country is shown highlighted on this map?",
    answer: name,
    category: "Geography",
    difficulty: "easy",
    imageUrl: resolvedUrl,
    imageCredit: "Map via Wikimedia Commons",
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list-states")) {
    console.log("Available US states:\n" + Object.keys(US_STATE_FILES).sort().join("\n"));
    return;
  }

  if (args.includes("--list-countries")) {
    console.log("Available countries:\n" + Object.keys(COUNTRY_FILES).sort().join("\n"));
    return;
  }

  const name = args[0];
  if (!name) {
    console.error(
      "Usage:\n" +
      "  node scripts/find-map-image.cjs \"Texas\"\n" +
      "  node scripts/find-map-image.cjs \"France\"\n" +
      "  node scripts/find-map-image.cjs --list-states\n" +
      "  node scripts/find-map-image.cjs --list-countries"
    );
    process.exit(1);
  }

  const stateFile = US_STATE_FILES[name];
  const countryFile = COUNTRY_FILES[name];
  const filename = stateFile ?? countryFile;
  const type = stateFile ? "state" : "country";

  if (!filename) {
    console.error(`"${name}" not found. Check --list-states or --list-countries.`);
    process.exit(1);
  }

  console.error(`Looking up: ${filename} …`);
  const resolvedUrl = await resolveUrl(filename);
  const question = buildQuestion(name, resolvedUrl, type);

  console.log("\nResolved image URL:");
  console.log(resolvedUrl);
  console.log("\nJSON entry (paste into geography.v1.json):");
  console.log(JSON.stringify(question, null, 2));
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { US_STATE_FILES, COUNTRY_FILES, slugify, wikimediaUrl, buildQuestion };
