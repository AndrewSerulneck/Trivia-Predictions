#!/usr/bin/env node
/**
 * Generates region-framed locator maps for Live Trivia geography questions.
 *
 * For every `geography-map-*` question, renders an SVG where the answer's
 * surrounding region fills the frame: ocean as background, all land in muted
 * gray, and the target country/state highlighted in orange. Output is written
 * to public/maps/{slug}.svg and served as a static asset.
 *
 * Usage:
 *   node scripts/generate-region-maps.cjs            # generate all
 *   node scripts/generate-region-maps.cjs France     # single answer (stdout)
 *
 * Data sources (public domain): Natural Earth via world-atlas, US Census via
 * us-atlas. Run after editing scripts/geo-regions.cjs.
 */

const fs = require("fs");
const path = require("path");
const topojson = require("topojson-client");
const { geoMercator, geoPath, geoBounds } = require("d3-geo");
const worldData = require("world-atlas/countries-50m.json");
const statesData = require("us-atlas/states-10m.json");
const {
  COUNTRY_NAME_ALIASES,
  COUNTRY_REGIONS,
  STATE_REGIONS,
  FRAME_OVERRIDES,
  COUNTRY_TO_REGION,
  STATE_TO_REGION,
} = require("./geo-regions.cjs");

const OUT_DIR = path.join(__dirname, "..", "public", "maps");
const GEO_JSON = path.join(
  __dirname,
  "..",
  "data",
  "live-trivia",
  "categories",
  "geography.v1.json"
);

const W = 800;
const H = 600;
const COLORS = {
  ocean: "#aacbe6",
  land: "#e7e2d8",
  target: "#f08a24",
  border: "#ffffff",
  targetBorder: "#b5611200",
};

const US_STATES = new Set(Object.keys(STATE_TO_REGION));

// --- feature collections -----------------------------------------------------
const countryFeatures = topojson.feature(
  worldData,
  worldData.objects.countries
).features;
const stateFeatures = topojson.feature(
  statesData,
  statesData.objects.states
).features;

const countryByName = new Map(
  countryFeatures.map((f) => [f.properties.name, f])
);
const stateByName = new Map(stateFeatures.map((f) => [f.properties.name, f]));

function atlasName(answer) {
  return COUNTRY_NAME_ALIASES[answer] ?? answer;
}

// Build a Mercator that maps the bounding box to fill the frame. We project the
// box's corner *points* and derive scale/translate manually — fitting to a bbox
// *polygon* triggers D3's spherical winding rule, which reads the box as the
// whole globe minus the box and frames the entire world instead.
function fitBboxMercator([w, s, e, n]) {
  const raw = geoMercator().scale(1).translate([0, 0]);
  const [x0, y0] = raw([w, n]); // top-left
  const [x1, y1] = raw([e, s]); // bottom-right
  const scale = Math.min(W / (x1 - x0), H / (y1 - y0));
  const tx = (W - scale * (x0 + x1)) / 2;
  const ty = (H - scale * (y0 + y1)) / 2;
  return geoMercator().scale(scale).translate([tx, ty]);
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Renders one map. `features` is the full pool to draw (countries or states);
 * `targetName` is the atlas name of the highlighted feature; `bbox` frames it.
 */
function renderMap({ features, targetName, bbox, answer }) {
  const projection = fitBboxMercator(bbox);
  const pathGen = geoPath(projection);

  const [w, s, e, n] = bbox;
  // Pad the cull box so partially-visible neighbors still draw for context.
  const pad = 8;
  const inBox = (f) => {
    const [[bw, bs], [be, bn]] = geoBounds(f);
    return be >= w - pad && bw <= e + pad && bn >= s - pad && bs <= n + pad;
  };

  const others = [];
  let targetPath = "";
  for (const f of features) {
    if (f.properties.name === targetName) {
      targetPath = pathGen(f) ?? "";
      continue;
    }
    if (!inBox(f)) continue;
    const d = pathGen(f);
    if (d) others.push(d);
  }

  if (!targetPath) {
    throw new Error(`No geometry rendered for "${answer}" (${targetName})`);
  }

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXml(
      answer
    )} highlighted on a regional map">`
  );
  parts.push(`<rect width="${W}" height="${H}" fill="${COLORS.ocean}"/>`);
  parts.push(
    `<g stroke="${COLORS.border}" stroke-width="1.5" stroke-linejoin="round">`
  );
  for (const d of others) parts.push(`<path d="${d}" fill="${COLORS.land}"/>`);
  parts.push(`</g>`);
  parts.push(
    `<path d="${targetPath}" fill="${COLORS.target}" stroke="${COLORS.border}" stroke-width="1.75" stroke-linejoin="round"/>`
  );
  parts.push(`</svg>`);
  return parts.join("");
}

function resolve(answer) {
  if (US_STATES.has(answer)) {
    const regionKey = STATE_TO_REGION[answer];
    const region = STATE_REGIONS[regionKey];
    const feature = stateByName.get(answer);
    if (!feature) throw new Error(`State not in atlas: ${answer}`);
    return {
      features: stateFeatures,
      targetName: answer,
      bbox: FRAME_OVERRIDES[answer] ?? region.bbox,
      answer,
    };
  }
  const regionKey = COUNTRY_TO_REGION[answer];
  if (!regionKey) throw new Error(`No region assigned for country: ${answer}`);
  const region = COUNTRY_REGIONS[regionKey];
  const name = atlasName(answer);
  if (!countryByName.get(name)) throw new Error(`Country not in atlas: ${name}`);
  return {
    features: countryFeatures,
    targetName: name,
    bbox: FRAME_OVERRIDES[answer] ?? region.bbox,
    answer,
  };
}

function main() {
  const single = process.argv[2];
  if (single) {
    process.stdout.write(renderMap(resolve(single)));
    return;
  }

  const geo = JSON.parse(fs.readFileSync(GEO_JSON, "utf8"));
  const mapQs = geo.questions.filter((q) => q.slug.startsWith("geography-map-"));
  // Drive generation off each question's slug so filenames match exactly,
  // including abbreviated slugs (e.g. geography-map-dem-rep-of-the-congo).
  const bySlug = new Map();
  for (const q of mapQs) if (!bySlug.has(q.slug)) bySlug.set(q.slug, q.answer);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  const failures = [];
  for (const [slug, answer] of bySlug) {
    try {
      const svg = renderMap(resolve(answer));
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg);
      ok++;
    } catch (err) {
      failures.push(`${answer}: ${err.message}`);
    }
  }
  console.log(`Generated ${ok}/${bySlug.size} maps -> public/maps/`);
  if (failures.length) {
    console.log(`\n${failures.length} failures:`);
    for (const f of failures) console.log("  " + f);
    process.exitCode = 1;
  }
}

main();
