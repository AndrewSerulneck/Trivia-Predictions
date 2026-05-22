export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

function getCurrentPositionWithOptions(options: PositionOptions): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => reject(error),
      options
    );
  });
}

export async function getCurrentLocation(): Promise<Coordinates> {
  return getCurrentPositionWithOptions({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
}

export type BestLocationOptions = {
  sampleDurationMs?: number;
  timeoutMs?: number;
  desiredAccuracyMeters?: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export async function getBestCurrentLocation(options: BestLocationOptions = {}): Promise<Coordinates> {
  const sampleDurationMs = Number.isFinite(options.sampleDurationMs)
    ? Math.max(2500, Number(options.sampleDurationMs))
    : 9000;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(sampleDurationMs + 1000, Number(options.timeoutMs))
    : 18000;
  const desiredAccuracyMeters = Number.isFinite(options.desiredAccuracyMeters)
    ? Math.max(5, Number(options.desiredAccuracyMeters))
    : 60;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    let settled = false;
    let watchId: number | null = null;
    const samples: Coordinates[] = [];
    const startedAt = Date.now();

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      if (samples.length > 0) {
        const latMedian = median(samples.map((item) => item.latitude));
        const lonMedian = median(samples.map((item) => item.longitude));
        const bestAccuracy = samples.reduce((best, current) => {
          const currentAccuracy = Number.isFinite(current.accuracy) ? (current.accuracy as number) : Number.POSITIVE_INFINITY;
          const bestAccuracyValue = Number.isFinite(best.accuracy) ? (best.accuracy as number) : Number.POSITIVE_INFINITY;
          return currentAccuracy < bestAccuracyValue ? current : best;
        }, samples[0]);

        resolve({
          latitude: latMedian,
          longitude: lonMedian,
          accuracy: bestAccuracy.accuracy,
          timestamp: Date.now(),
        });
        return;
      }

      void getCurrentPositionWithOptions({
        enableHighAccuracy: false,
        timeout: Math.max(6000, Math.min(timeoutMs, 14000)),
        maximumAge: 120000,
      })
        .then((fallbackCoords) => {
          resolve(fallbackCoords);
        })
        .catch(() => {
          reject(error instanceof Error ? error : new Error("Unable to determine location."));
        });
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        samples.push({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });

        const elapsed = Date.now() - startedAt;
        if (elapsed >= 1500 && position.coords.accuracy <= desiredAccuracyMeters) {
          finish();
        }
      },
      (error) => finish(error),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );

    globalThis.setTimeout(() => finish(), sampleDurationMs);
    globalThis.setTimeout(() => finish(new Error("Location request timed out.")), timeoutMs + 500);
  });
}

export function calculateDistanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return earthRadius * c;
}

export interface AddressPrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
}

export interface AddressDetails {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GoogleAutocompleteNewPayload = {
  suggestions?: Array<{
    placePrediction?: {
      place?: string;
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type AddressComponentRow = {
  longText?: string;
  shortText?: string;
  types?: string[];
  long_name?: string;
  short_name?: string;
};

type GooglePlaceDetailsNewPayload = {
  id?: string;
  name?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponentRow[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

const GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_BASE = "https://places.googleapis.com/v1/places";
const DEFAULT_REGION_CODE = "US";
const DEFAULT_INCLUDED_REGION_CODES = ["us"];
const US_LOCATION_BIAS_RECTANGLE = {
  low: {
    latitude: 24.396308,
    longitude: -124.848974,
  },
  high: {
    latitude: 49.384358,
    longitude: -66.885444,
  },
};

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Google Maps API key is not configured.");
  }
  return apiKey;
}

function normalizeQuery(value: string): string {
  return value.trim();
}

function findComponent(
  components: AddressComponentRow[],
  targetType: string
): { longName: string; shortName: string } | null {
  const match = components.find((component) => (component.types ?? []).includes(targetType));
  if (!match) return null;
  return {
    longName: String(match.longText ?? match.long_name ?? "").trim(),
    shortName: String(match.shortText ?? match.short_name ?? "").trim(),
  };
}

function parseStreet(components: AddressComponentRow[]): string {
  const streetNumber = findComponent(components, "street_number")?.longName ?? "";
  const route = findComponent(components, "route")?.longName ?? "";
  return [streetNumber, route].filter(Boolean).join(" ").trim();
}

function parseCity(components: AddressComponentRow[]): string {
  const locality =
    findComponent(components, "locality")?.longName ||
    findComponent(components, "postal_town")?.longName ||
    findComponent(components, "sublocality_level_1")?.longName ||
    findComponent(components, "administrative_area_level_3")?.longName ||
    "";
  return locality.trim();
}

function parseState(components: AddressComponentRow[]): string {
  const stateComponent = findComponent(components, "administrative_area_level_1");
  if (!stateComponent) return "";
  const shortCode = stateComponent.shortName.toUpperCase();
  if (shortCode.length === 2) return shortCode;
  return shortCode.slice(0, 2);
}

function parseZipCode(components: AddressComponentRow[]): string {
  return (findComponent(components, "postal_code")?.longName ?? "").trim();
}

function parseCountry(components: AddressComponentRow[]): string {
  return (findComponent(components, "country")?.longName ?? "").trim();
}

function normalizeSessionToken(value?: string): string | undefined {
  const token = String(value ?? "").trim();
  if (!token) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return undefined;
  if (token.length > 36) return token.slice(0, 36);
  return token;
}

async function readGoogleApiError(response: Response): Promise<string> {
  const generic = `Google Places request failed (${response.status}).`;
  try {
    const payload = (await response.json()) as GoogleApiErrorPayload;
    const message = String(payload.error?.message ?? "").trim();
    return message || generic;
  } catch {
    return generic;
  }
}

export function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[byte % 64]).join("");
    return token.slice(0, 36);
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 36);
  }
  return Math.random().toString(36).slice(2).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
}

export async function getAddressPredictions(
  query: string,
  sessionToken?: string
): Promise<AddressPrediction[]> {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < 3) return [];

  const apiKey = getApiKey();
  const normalizedSessionToken = normalizeSessionToken(sessionToken);
  const requestBody: Record<string, unknown> = {
    input: normalizedQuery,
    includedRegionCodes: DEFAULT_INCLUDED_REGION_CODES,
    regionCode: DEFAULT_REGION_CODE,
    languageCode: "en",
    locationBias: {
      rectangle: US_LOCATION_BIAS_RECTANGLE,
    },
  };
  if (normalizedSessionToken) {
    requestBody.sessionToken = normalizedSessionToken;
  }

  const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readGoogleApiError(response));
  }

  const payload = (await response.json()) as GoogleAutocompleteNewPayload;
  return (payload.suggestions ?? [])
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return null;
      const placeRef = String(prediction.place ?? "").trim();
      const placeIdFromRef = placeRef.startsWith("places/") ? placeRef.slice("places/".length) : "";
      const placeId = String(prediction.placeId ?? placeIdFromRef).trim();
      const mainText = String(prediction.structuredFormat?.mainText?.text ?? "").trim();
      const secondaryText = String(prediction.structuredFormat?.secondaryText?.text ?? "").trim();
      const fullText = String(prediction.text?.text ?? "").trim() || [mainText, secondaryText].filter(Boolean).join(", ");
      return {
        placeId,
        mainText,
        secondaryText,
        fullText,
      };
    })
    .filter((prediction): prediction is AddressPrediction => Boolean(prediction?.placeId && prediction?.fullText));
}

export async function getAddressDetails(
  placeId: string,
  sessionToken?: string
): Promise<AddressDetails> {
  const normalizedPlaceId = String(placeId ?? "").trim();
  if (!normalizedPlaceId) {
    throw new Error("placeId is required.");
  }

  const apiKey = getApiKey();
  const params = new URLSearchParams({
    languageCode: "en",
    regionCode: DEFAULT_REGION_CODE.toLowerCase(),
  });
  const normalizedSessionToken = normalizeSessionToken(sessionToken);
  if (normalizedSessionToken) params.set("sessionToken", normalizedSessionToken);

  const response = await fetch(`${GOOGLE_PLACES_DETAILS_BASE}/${encodeURIComponent(normalizedPlaceId)}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readGoogleApiError(response));
  }

  const payload = (await response.json()) as GooglePlaceDetailsNewPayload;
  if (!payload) {
    throw new Error("Address details not found for the selected place.");
  }

  const components = payload.addressComponents ?? [];
  const latitude = Number(payload.location?.latitude);
  const longitude = Number(payload.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Selected address is missing map coordinates.");
  }

  const street = parseStreet(components);
  const city = parseCity(components);
  const state = parseState(components);
  const zipCode = parseZipCode(components);
  const country = parseCountry(components);

  return {
    street: street || String(payload.formattedAddress ?? "").trim(),
    city,
    state,
    zipCode,
    country,
    latitude,
    longitude,
    placeId: String(payload.id ?? normalizedPlaceId),
  };
}
