import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";

type Suggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

type NominatimPayloadItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

type GoogleAutocompletePayload = {
  suggestions?: Array<{
    placePrediction?: {
      place?: string;
      placeId?: string;
      text?: { text?: string };
    };
  }>;
  error?: {
    message?: string;
  };
};

type GooglePlaceDetailsPayload = {
  id?: string;
  formattedAddress?: string;
  displayName?: {
    text?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
  error?: {
    message?: string;
  };
};

const GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places";

async function getNominatimSuggestions(
  query: string,
  limit: number
): Promise<Suggestion[]> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=${limit}&q=${encodedQuery}`,
    {
      headers: {
        "User-Agent": "Trivia-Predictions-Admin/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Nominatim request failed.");
  }

  const payload = (await response.json()) as NominatimPayloadItem[];
  const suggestions: Suggestion[] = [];
  for (const item of payload) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    const label = item.display_name?.trim();
    if (!label) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    suggestions.push({ label, latitude, longitude });
  }

  return suggestions;
}

async function getGoogleSuggestions(
  query: string,
  limit: number,
  apiKey: string
): Promise<Suggestion[]> {
  const autocompleteResponse = await fetch(GOOGLE_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["us"],
      regionCode: "US",
      languageCode: "en",
    }),
    cache: "no-store",
  });

  if (!autocompleteResponse.ok) {
    const payload = (await autocompleteResponse.json().catch(() => ({}))) as GoogleAutocompletePayload;
    throw new Error(payload.error?.message?.trim() || "Google Places autocomplete request failed.");
  }

  const autocompletePayload = (await autocompleteResponse.json()) as GoogleAutocompletePayload;
  const predictions = (autocompletePayload.suggestions ?? [])
    .map((item) => {
      const placePrediction = item.placePrediction;
      if (!placePrediction) {
        return { placeId: "", description: "" };
      }
      const placeRef = String(placePrediction.place ?? "").trim();
      const placeIdFromRef = placeRef.startsWith("places/") ? placeRef.slice("places/".length) : "";
      const placeId = String(placePrediction.placeId ?? placeIdFromRef).trim();
      const description = String(placePrediction.text?.text ?? "").trim();
      return { placeId, description };
    })
    .filter((item) => item.placeId);
  if (predictions.length === 0) {
    return [];
  }

  const detailLookups = predictions.slice(0, limit).map(async (item) => {
    const detailParams = new URLSearchParams({
      languageCode: "en",
      regionCode: "us",
    });
    const response = await fetch(
      `${GOOGLE_DETAILS_BASE_URL}/${encodeURIComponent(item.placeId)}?${detailParams.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
        },
        cache: "no-store",
      }
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GooglePlaceDetailsPayload;
    const latitude = Number(payload.location?.latitude);
    const longitude = Number(payload.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const formattedAddress = payload.formattedAddress?.trim();
    const name = payload.displayName?.text?.trim();
    const label = item.description || (name && formattedAddress ? `${name} — ${formattedAddress}` : formattedAddress || name);
    if (!label) {
      return null;
    }

    return {
      label,
      latitude,
      longitude,
    } as Suggestion;
  });

  const details = await Promise.all(detailLookups);
  return details.filter((item): item is Suggestion => Boolean(item));
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();
    if (query.length < 3) {
      return NextResponse.json({ ok: true, suggestions: [] });
    }

    const rawLimit = Number.parseInt(searchParams.get("limit") ?? "8", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(12, rawLimit)) : 8;
    const provider = (searchParams.get("provider") ?? "").trim().toLowerCase();
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    let suggestions: Suggestion[] = [];
    if ((provider === "google" || provider === "") && googleApiKey) {
      try {
        suggestions = await getGoogleSuggestions(query, limit, googleApiKey);
      } catch {
        suggestions = await getNominatimSuggestions(query, limit);
      }
    } else {
      suggestions = await getNominatimSuggestions(query, limit);
    }

    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load address suggestions." },
      { status: 500 }
    );
  }
}
