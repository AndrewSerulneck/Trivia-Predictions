type RegionSeed = {
  name: string;
  states: string[];
};

export const GEOGRAPHIC_HIERARCHY: { regions: Record<string, RegionSeed> } = {
  regions: {
    northeast: {
      name: "Northeast",
      states: ["CT", "MA", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
    },
    southeast: {
      name: "Southeast",
      states: ["AL", "AR", "DC", "DE", "FL", "GA", "KY", "LA", "MD", "MS", "NC", "SC", "TN", "VA", "WV"],
    },
    midwest: {
      name: "Midwest",
      states: ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"],
    },
    southwest: {
      name: "Southwest",
      states: ["AZ", "NM", "OK", "TX"],
    },
    west: {
      name: "West",
      states: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
    },
  },
};

const REGION_NAME_TO_KEY = new Map(
  Object.entries(GEOGRAPHIC_HIERARCHY.regions).map(([key, value]) => [value.name.toLowerCase(), key])
);

const STATE_TO_REGION_KEY = new Map<string, string>();
for (const [regionKey, region] of Object.entries(GEOGRAPHIC_HIERARCHY.regions)) {
  for (const state of region.states) {
    STATE_TO_REGION_KEY.set(state, regionKey);
  }
}

export type GeographicVenueLeaf = {
  id: string;
  name: string;
  addressLabel: string;
};

export type GeographicZipNode = {
  zipCode: string;
  venues: GeographicVenueLeaf[];
};

export type GeographicCityNode = {
  city: string;
  zipCodes: GeographicZipNode[];
};

export type GeographicStateNode = {
  stateCode: string;
  cities: GeographicCityNode[];
};

export type GeographicRegionNode = {
  regionKey: string;
  name: string;
  states: GeographicStateNode[];
};

export type GeographicHierarchy = {
  generatedAt: string;
  totalVenues: number;
  regions: GeographicRegionNode[];
};

export type GeographicVenueInput = {
  id: string;
  name: string;
  displayName?: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  region?: string;
};

function normalizeText(value: string | undefined): string {
  return String(value ?? "").trim();
}

function normalizeStateCode(value: string | undefined): string {
  return normalizeText(value).toUpperCase();
}

function normalizeRegionKey(value: string | undefined): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";
  if (GEOGRAPHIC_HIERARCHY.regions[normalized]) return normalized;
  return REGION_NAME_TO_KEY.get(normalized) ?? "";
}

function buildAddressLabel(input: GeographicVenueInput): string {
  const street = normalizeText(input.street || input.address);
  const city = normalizeText(input.city);
  const state = normalizeStateCode(input.state);
  const zipCode = normalizeText(input.zipCode);
  const cityStateZip = [city, [state, zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function getRegionForVenue(input: GeographicVenueInput): string {
  const explicitRegion = normalizeRegionKey(input.region);
  if (explicitRegion) return explicitRegion;
  const stateCode = normalizeStateCode(input.state);
  return STATE_TO_REGION_KEY.get(stateCode) ?? "other";
}

function sortByName<T>(items: T[], getter: (item: T) => string): T[] {
  return [...items].sort((a, b) => getter(a).localeCompare(getter(b)));
}

export function buildGeographicHierarchy(venues: GeographicVenueInput[]): GeographicHierarchy {
  const regionMap = new Map<
    string,
    {
      regionKey: string;
      name: string;
      states: Map<
        string,
        {
          stateCode: string;
          cities: Map<
            string,
            {
              city: string;
              zipCodes: Map<
                string,
                {
                  zipCode: string;
                  venues: GeographicVenueLeaf[];
                }
              >;
            }
          >;
        }
      >;
    }
  >();

  const ensureRegion = (regionKey: string) => {
    const normalizedKey = regionKey || "other";
    let region = regionMap.get(normalizedKey);
    if (!region) {
      const seeded = GEOGRAPHIC_HIERARCHY.regions[normalizedKey];
      region = {
        regionKey: normalizedKey,
        name: seeded?.name ?? "Other",
        states: new Map(),
      };
      regionMap.set(normalizedKey, region);
    }
    return region;
  };

  for (const venue of venues) {
    const id = normalizeText(venue.id);
    if (!id) continue;

    const stateCode = normalizeStateCode(venue.state);
    const city = normalizeText(venue.city);
    const zipCode = normalizeText(venue.zipCode);
    if (!stateCode || !city || !zipCode) {
      continue;
    }

    const region = ensureRegion(getRegionForVenue(venue));
    let stateNode = region.states.get(stateCode);
    if (!stateNode) {
      stateNode = {
        stateCode,
        cities: new Map(),
      };
      region.states.set(stateCode, stateNode);
    }

    let cityNode = stateNode.cities.get(city);
    if (!cityNode) {
      cityNode = {
        city,
        zipCodes: new Map(),
      };
      stateNode.cities.set(city, cityNode);
    }

    let zipNode = cityNode.zipCodes.get(zipCode);
    if (!zipNode) {
      zipNode = {
        zipCode,
        venues: [],
      };
      cityNode.zipCodes.set(zipCode, zipNode);
    }

    const venueName = normalizeText(venue.displayName) || normalizeText(venue.name) || `Venue ${id}`;
    zipNode.venues.push({
      id,
      name: venueName,
      addressLabel: buildAddressLabel(venue),
    });
  }

  const regions = sortByName([...regionMap.values()], (region) => region.name).map((region) => ({
    regionKey: region.regionKey,
    name: region.name,
    states: sortByName([...region.states.values()], (state) => state.stateCode).map((state) => ({
      stateCode: state.stateCode,
      cities: sortByName([...state.cities.values()], (city) => city.city).map((city) => ({
        city: city.city,
        zipCodes: sortByName([...city.zipCodes.values()], (zip) => zip.zipCode).map((zip) => ({
          zipCode: zip.zipCode,
          venues: sortByName(zip.venues, (venue) => venue.name),
        })),
      })),
    })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    totalVenues: venues.length,
    regions,
  };
}

