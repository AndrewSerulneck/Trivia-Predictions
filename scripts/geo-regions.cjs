/**
 * Region definitions for region-framed Live Trivia maps.
 *
 * Each region has a geographic bounding box [west, south, east, north] (lon/lat
 * degrees). The map generator fits the projection to this box so the region
 * fills the image frame; countries/states partly outside the box are clipped by
 * the SVG viewport. Every map answer is assigned to exactly one region.
 *
 * Atlas name aliases reconcile our answer strings with Natural Earth
 * (world-atlas) feature `properties.name` values.
 */

// Answer string -> Natural Earth (world-atlas) properties.name
const COUNTRY_NAME_ALIASES = {
  "Bosnia and Herzegovina": "Bosnia and Herz.",
  "Czech Republic": "Czechia",
  "North Macedonia": "Macedonia",
  "Dominican Republic": "Dominican Rep.",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
};

// region key -> { bbox: [W, S, E, N], members: [answer names...] }
const COUNTRY_REGIONS = {
  europeWest: {
    bbox: [-11, 35.5, 20.5, 60],
    members: [
      "Portugal", "Spain", "France", "United Kingdom", "Ireland", "Belgium",
      "Netherlands", "Luxembourg", "Germany", "Switzerland", "Austria", "Italy",
    ],
  },
  europeNorth: {
    bbox: [-25, 53, 42, 71.5],
    members: [
      "Iceland", "Norway", "Sweden", "Finland", "Denmark", "Estonia", "Latvia",
      "Lithuania",
    ],
  },
  europeEast: {
    bbox: [13, 44, 41, 57],
    members: ["Poland", "Belarus", "Ukraine", "Moldova"],
  },
  europeBalkans: {
    bbox: [12, 37.5, 30.5, 49.5],
    members: [
      "Czech Republic", "Slovakia", "Hungary", "Slovenia", "Croatia",
      "Bosnia and Herzegovina", "Serbia", "Montenegro", "Albania",
      "North Macedonia", "Greece", "Bulgaria", "Romania",
    ],
  },
  middleEast: {
    bbox: [25, 11, 64, 43],
    members: [
      "Turkey", "Syria", "Lebanon", "Israel", "Jordan", "Iraq", "Iran",
      "Saudi Arabia", "Yemen", "United Arab Emirates",
    ],
  },
  northAfrica: {
    bbox: [-17, 17, 38, 38],
    members: ["Morocco", "Algeria", "Tunisia", "Libya", "Egypt"],
  },
  westAfrica: {
    bbox: [-18, -7, 28, 28],
    members: ["Senegal", "Mali", "Ghana", "Nigeria", "Cameroon", "Angola"],
  },
  eastAfrica: {
    bbox: [27, -13, 53, 23],
    members: [
      "Sudan", "Ethiopia", "Somalia", "Kenya", "Uganda", "Tanzania",
      "Democratic Republic of the Congo",
    ],
  },
  southernAfrica: {
    bbox: [10, -36, 52, -4],
    members: ["Zambia", "Zimbabwe", "Mozambique", "Madagascar", "South Africa"],
  },
  southAsia: {
    bbox: [59, 4, 93, 39],
    members: [
      "Afghanistan", "Pakistan", "India", "Nepal", "Bangladesh", "Sri Lanka",
    ],
  },
  centralAsia: {
    bbox: [44, 35, 88, 56],
    members: ["Azerbaijan", "Kazakhstan", "Uzbekistan"],
  },
  eastAsia: {
    bbox: [73, 17, 147, 54],
    members: [
      "Mongolia", "China", "North Korea", "South Korea", "Japan", "Taiwan",
    ],
  },
  southeastAsia: {
    bbox: [91, -11, 142, 29],
    members: [
      "Myanmar", "Thailand", "Laos", "Cambodia", "Vietnam", "Malaysia",
      "Indonesia", "Philippines",
    ],
  },
  northAmerica: {
    bbox: [-168, 13, -52, 72],
    members: ["Canada", "Mexico"],
  },
  centralAmerica: {
    bbox: [-93, 6.5, -58, 27.5],
    members: [
      "Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica",
      "Panama", "Cuba", "Jamaica", "Haiti", "Dominican Republic",
    ],
  },
  southAmerica: {
    bbox: [-82, -56, -34, 13],
    members: [
      "Colombia", "Venezuela", "Ecuador", "Peru", "Bolivia", "Brazil",
      "Paraguay", "Uruguay", "Argentina", "Chile",
    ],
  },
  oceania: {
    bbox: [110, -48, 179, -8],
    members: ["Australia", "New Zealand"],
  },
  // Russia spans the antimeridian; a wide Eurasian frame keeps it whole.
  russiaFrame: {
    bbox: [18, 40, 179, 78],
    members: ["Russia"],
  },
};

// Per-answer frame overrides for targets that render too small inside their
// region frame. Uses a tighter bbox while keeping recognizable context.
const FRAME_OVERRIDES = {
  Luxembourg: [2.5, 47.4, 9.5, 51.6], // Belgium / E. France / W. Germany context
};

// US Census-style regions. bbox in lon/lat; members are state names.
const STATE_REGIONS = {
  northeast: {
    bbox: [-80.6, 38.2, -66.8, 47.6],
    members: [
      "Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island",
      "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware",
      "Maryland",
    ],
  },
  southeast: {
    bbox: [-92, 24, -75, 39.2],
    members: [
      "Virginia", "West Virginia", "Kentucky", "Tennessee", "North Carolina",
      "South Carolina", "Georgia", "Florida", "Alabama", "Mississippi",
      "Arkansas", "Louisiana",
    ],
  },
  midwest: {
    bbox: [-104.5, 35.8, -80, 49.6],
    members: [
      "Ohio", "Indiana", "Illinois", "Michigan", "Wisconsin", "Minnesota",
      "Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas",
    ],
  },
  southwest: {
    bbox: [-115, 25, -93, 37.5],
    members: ["Texas", "Oklahoma", "New Mexico", "Arizona"],
  },
  west: {
    bbox: [-125, 31, -102, 49.5],
    members: [
      "California", "Oregon", "Washington", "Nevada", "Idaho", "Montana",
      "Wyoming", "Utah", "Colorado",
    ],
  },
  alaska: {
    bbox: [-170, 51, -129, 72],
    members: ["Alaska"],
  },
  hawaii: {
    bbox: [-161, 18.4, -154, 22.6],
    members: ["Hawaii"],
  },
};

// Build answer -> region lookups
function invert(regions) {
  const map = {};
  for (const [key, def] of Object.entries(regions)) {
    for (const m of def.members) map[m] = key;
  }
  return map;
}

const COUNTRY_TO_REGION = invert(COUNTRY_REGIONS);
const STATE_TO_REGION = invert(STATE_REGIONS);

module.exports = {
  COUNTRY_NAME_ALIASES,
  COUNTRY_REGIONS,
  STATE_REGIONS,
  FRAME_OVERRIDES,
  COUNTRY_TO_REGION,
  STATE_TO_REGION,
};
