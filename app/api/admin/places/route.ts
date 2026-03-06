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
  predictions?: Array<{
    place_id?: string;
    description?: string;
  }>;
  status?: string;
  error_message?: string;
};

type GooglePlaceDetailsPayload = {
  result?: {
    formatted_address?: string;
    name?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  };
  status?: string;
  error_message?: string;
};

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
  const encodedQuery = encodeURIComponent(query);
  const autocompleteResponse = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedQuery}&types=address&key=${apiKey}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!autocompleteResponse.ok) {
    throw new Error("Google Places autocomplete request failed.");
  }

  const autocompletePayload = (await autocompleteResponse.json()) as GoogleAutocompletePayload;
  if (autocompletePayload.status !== "OK" && autocompletePayload.status !== "ZERO_RESULTS") {
    const message = autocompletePayload.error_message || "Google Places autocomplete failed.";
    throw new Error(message);
  }

  const predictions = (autocompletePayload.predictions ?? [])
    .map((item) => ({ placeId: item.place_id?.trim() ?? "", description: item.description?.trim() ?? "" }))
    .filter((item) => item.placeId);
  if (predictions.length === 0) {
    return [];
  }

  const detailLookups = predictions.slice(0, limit).map(async (item) => {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        item.placeId
      )}&fields=name,formatted_address,geometry&key=${apiKey}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GooglePlaceDetailsPayload;
    if (payload.status !== "OK") {
      return null;
    }

    const latitude = Number(payload.result?.geometry?.location?.lat);
    const longitude = Number(payload.result?.geometry?.location?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const formattedAddress = payload.result?.formatted_address?.trim();
    const name = payload.result?.name?.trim();
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
