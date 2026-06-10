#!/usr/bin/env node
/**
 * Generates map-based geography questions for all 50 US states and ~100 countries
 * and appends any missing ones to data/live-trivia/categories/geography.v1.json.
 *
 * Safe to re-run — skips any slug that already exists in the file.
 *
 * Usage: node scripts/generate-map-questions.cjs
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const { US_STATE_FILES, COUNTRY_FILES, slugify, wikimediaUrl } = require("./find-map-image.cjs");

const GEO_FILE = join(process.cwd(), "data", "live-trivia", "categories", "geography.v1.json");

// ---------------------------------------------------------------------------
// Difficulty overrides — anything not listed defaults to "easy"
// ---------------------------------------------------------------------------

/** States that are hard to identify by shape (small, rectangular, or easily confused) */
const HARD_STATES = new Set([
  "Connecticut", "Delaware", "Idaho", "Iowa", "Kansas",
  "Montana", "Nebraska", "New Hampshire", "New Mexico", "North Dakota",
  "Rhode Island", "South Dakota", "Utah", "Vermont", "West Virginia", "Wyoming",
]);

const MEDIUM_STATES = new Set([
  "Alabama", "Arkansas", "Colorado", "Indiana", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Nevada", "New Jersey",
  "North Carolina", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "South Carolina", "Tennessee", "Virginia", "Washington", "Wisconsin",
]);

/** Countries that are harder to identify (small, similar shape to neighbours, or rarely seen on maps) */
const HARD_COUNTRIES = new Set([
  "Albania", "Azerbaijan", "Belarus", "Bosnia and Herzegovina", "Bulgaria",
  "Cambodia", "Democratic Republic of the Congo", "El Salvador", "Estonia", "Haiti",
  "Honduras", "Jordan", "Laos", "Latvia", "Lithuania", "Luxembourg",
  "Moldova", "Montenegro", "Mozambique", "Myanmar", "Nepal", "Nicaragua",
  "North Macedonia", "Paraguay", "Serbia", "Slovakia", "Slovenia",
  "Somalia", "Sri Lanka", "Syria", "Taiwan", "Uzbekistan", "Yemen", "Zambia",
]);

const MEDIUM_COUNTRIES = new Set([
  "Afghanistan", "Algeria", "Angola", "Austria", "Bangladesh", "Belgium",
  "Bolivia", "Cameroon", "Chile", "Colombia", "Costa Rica", "Croatia",
  "Cuba", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador",
  "Ethiopia", "Finland", "Ghana", "Greece", "Guatemala", "Hungary",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Jamaica", "Kazakhstan",
  "Kenya", "Libya", "Madagascar", "Malaysia", "Mali", "Mongolia", "Morocco",
  "Netherlands", "New Zealand", "Nigeria", "North Korea", "Norway",
  "Pakistan", "Panama", "Peru", "Philippines", "Poland", "Portugal",
  "Romania", "Saudi Arabia", "Senegal", "South Korea", "Sudan", "Switzerland",
  "Tanzania", "Thailand", "Tunisia", "Turkey", "Uganda", "Ukraine",
  "United Arab Emirates", "Uruguay", "Venezuela", "Vietnam", "Zimbabwe",
]);

function difficulty(name, type) {
  if (type === "state") {
    if (HARD_STATES.has(name)) return "hard";
    if (MEDIUM_STATES.has(name)) return "medium";
    return "easy";
  }
  if (HARD_COUNTRIES.has(name)) return "hard";
  if (MEDIUM_COUNTRIES.has(name)) return "medium";
  return "easy";
}

function acceptableAnswers(name, type) {
  if (type === "state") {
    const extras = {
      "Washington": ["Washington State"],
      "Georgia":    ["Georgia (U.S. state)"],
    };
    return extras[name] ?? [];
  }
  const extras = {
    "United Kingdom":         ["UK", "Great Britain", "England"],
    "Czech Republic":         ["Czechia"],
    "Russia":                 ["Russian Federation"],
    "South Korea":            ["Korea", "Republic of Korea"],
    "North Korea":            ["Democratic People's Republic of Korea"],
    "Taiwan":                 ["Republic of China"],
    "Democratic Republic of the Congo": ["DRC", "Congo", "Democratic Republic of Congo", "Dem. Rep. of the Congo"],
    "Bosnia and Herzegovina": ["Bosnia", "Herzegovina"],
    "North Macedonia":        ["Macedonia"],
    "United Arab Emirates":   ["UAE"],
  };
  return extras[name] ?? [];
}

function buildEntry(name, type) {
  const files = type === "state" ? US_STATE_FILES : COUNTRY_FILES;
  const filename = files[name];
  const url = wikimediaUrl(filename);
  const slug = slugify(name);
  const acc = acceptableAnswers(name, type);
  const entry = {
    slug,
    question: type === "state"
      ? "Which U.S. state is shown highlighted on this map?"
      : "Which country is shown highlighted on this map?",
    answer: name,
    category: "Geography",
    difficulty: difficulty(name, type),
    imageUrl: url,
    imageCredit: "Map via Wikimedia Commons",
  };
  if (acc.length > 0) entry.acceptableAnswers = acc;
  return entry;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const raw = JSON.parse(readFileSync(GEO_FILE, "utf-8"));
const existingSlugs = new Set(raw.questions.map((q) => q.slug));

const newEntries = [];

for (const name of Object.keys(US_STATE_FILES)) {
  const slug = slugify(name);
  if (!existingSlugs.has(slug)) {
    newEntries.push(buildEntry(name, "state"));
  }
}

for (const name of Object.keys(COUNTRY_FILES)) {
  const slug = slugify(name);
  if (!existingSlugs.has(slug)) {
    newEntries.push(buildEntry(name, "country"));
  }
}

if (newEntries.length === 0) {
  console.log("Nothing to add — all states and countries already present.");
  process.exit(0);
}

raw.questions.push(...newEntries);
writeFileSync(GEO_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");

const states = newEntries.filter((e) => US_STATE_FILES[e.answer]);
const countries = newEntries.filter((e) => COUNTRY_FILES[e.answer]);
console.log(`Added ${newEntries.length} questions (${states.length} states, ${countries.length} countries).`);
