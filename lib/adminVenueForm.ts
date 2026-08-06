// Shared venue-form shape, payload builder and validation.
//
// Extracted from components/admin/sections/VenuesSection.tsx in admin-mobile
// Phase 4 so the desktop form and the mobile Activate-a-Venue flow submit the
// exact same payload through the exact same client-side checks. Server-side
// validation lives in lib/admin.ts (createAdminVenue / updateAdminVenue) and is
// the real gate — nothing here weakens it.

import type { Venue } from "@/types";

export type VenueFormState = {
  name: string;
  displayName: string;
  logoText: string;
  iconEmoji: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  county: string;
  region: string;
  radius: string;
  latitude: string;
  longitude: string;
  placeId: string;
  screenEnabled: boolean;
  screenBrandImageUrl: string;
  screenBrandPrimary: string;
  screenBrandSecondary: string;
  screenSponsorRotationEnabled: boolean;
};

export type VenuePayload = {
  name: string;
  street: string;
  address: string;
  radius: number;
  latitude: number | undefined;
  longitude: number | undefined;
  displayName: string | undefined;
  logoText: string | undefined;
  iconEmoji: string | undefined;
  city: string | undefined;
  state: string | undefined;
  zipCode: string | undefined;
  country: string | undefined;
  county: string | undefined;
  region: string | undefined;
  placeId: string | undefined;
  screenEnabled: boolean;
  screenBrandImageUrl: string | undefined;
  screenBrandPrimary: string | undefined;
  screenBrandSecondary: string | undefined;
  screenSponsorRotationEnabled: boolean;
};

export const DEFAULT_VENUE_RADIUS = 150;

// US-only product, and the address lookup fills this from Places anyway. The
// manual path pre-fills it so a salesperson never has to think about it.
export const DEFAULT_VENUE_COUNTRY = "United States";

export const BLANK_VENUE_FORM: VenueFormState = {
  name: "",
  displayName: "",
  logoText: "",
  iconEmoji: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  county: "",
  region: "",
  radius: String(DEFAULT_VENUE_RADIUS),
  latitude: "",
  longitude: "",
  placeId: "",
  screenEnabled: true,
  screenBrandImageUrl: "",
  screenBrandPrimary: "",
  screenBrandSecondary: "",
  screenSponsorRotationEnabled: false,
};

export function venueToForm(v: Venue): VenueFormState {
  return {
    name: v.name,
    displayName: v.displayName ?? "",
    logoText: v.logoText ?? "",
    iconEmoji: v.iconEmoji ?? "",
    street: v.street ?? v.address ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    zipCode: v.zipCode ?? "",
    country: v.country ?? "",
    county: v.county ?? "",
    region: v.region ?? "",
    radius: String(v.radius),
    latitude: String(v.latitude),
    longitude: String(v.longitude),
    placeId: v.placeId ?? "",
    screenEnabled: v.screenEnabled ?? true,
    screenBrandImageUrl: v.screenBrandImageUrl ?? "",
    screenBrandPrimary: v.screenBrandPrimary ?? "",
    screenBrandSecondary: v.screenBrandSecondary ?? "",
    screenSponsorRotationEnabled: v.screenSponsorRotationEnabled ?? false,
  };
}

export function formatAddressDisplay(venue: Venue): string {
  const street = venue.street ?? venue.address ?? "";
  const cityStateZip = [venue.city ?? "", [venue.state ?? "", venue.zipCode ?? ""].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

export function buildAddressLabel(form: VenueFormState): string {
  const cityStateZip = [
    form.city.trim(),
    [form.state.trim().toUpperCase(), form.zipCode.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return [form.street.trim(), cityStateZip, form.country.trim()].filter(Boolean).join(", ");
}

export function isVenueAddressIncomplete(venue: Venue): boolean {
  const street = String(venue.street ?? venue.address ?? "").trim();
  const city = String(venue.city ?? "").trim();
  const state = String(venue.state ?? "").trim();
  const zipCode = String(venue.zipCode ?? "").trim();
  const lat = Number(venue.latitude);
  const lng = Number(venue.longitude);
  const hasValidCoords =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return !street || !city || !state || !zipCode || !hasValidCoords;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function buildVenuePayload(form: VenueFormState): VenuePayload {
  return {
    name: form.name.trim(),
    street: form.street.trim(),
    address: buildAddressLabel(form),
    radius: Number.parseInt(form.radius, 10) || DEFAULT_VENUE_RADIUS,
    latitude: form.latitude ? Number.parseFloat(form.latitude) : undefined,
    longitude: form.longitude ? Number.parseFloat(form.longitude) : undefined,
    displayName: form.displayName.trim() || undefined,
    logoText: form.logoText.trim() || undefined,
    iconEmoji: form.iconEmoji.trim() || undefined,
    city: form.city.trim() || undefined,
    state: form.state.trim().toUpperCase() || undefined,
    zipCode: form.zipCode.trim() || undefined,
    country: form.country.trim() || undefined,
    county: form.county.trim() || undefined,
    region: form.region.trim() || undefined,
    placeId: form.placeId.trim() || undefined,
    screenEnabled: form.screenEnabled,
    screenBrandImageUrl: form.screenBrandImageUrl.trim() || undefined,
    screenBrandPrimary: form.screenBrandPrimary.trim() || undefined,
    screenBrandSecondary: form.screenBrandSecondary.trim() || undefined,
    screenSponsorRotationEnabled: form.screenSponsorRotationEnabled,
  };
}

/**
 * Client-side pre-flight for the venue create/update payload. Returns the first
 * problem as a human sentence, or null when the form is submittable.
 *
 * Note this is stricter than the server (which requires only name, street,
 * coordinates and a 25–2000m radius): city/state/ZIP are required here because a
 * venue with a half-filled address shows up broken in the player-facing venue
 * list. Both the desktop form and the mobile activation flow use this — the
 * mobile flow is a shorter *presentation*, not a shorter validation.
 */
export function validateVenueForm(form: VenueFormState): string | null {
  if (!form.name.trim()) return "Venue name is required.";
  if (!form.street.trim()) return "Street address is required.";
  if (!form.city.trim()) return "City is required.";
  if (!form.state.trim()) return "State is required.";
  if (!form.zipCode.trim()) return "ZIP code is required.";
  if (!form.country.trim()) return "Country is required.";

  const latitude = Number.parseFloat(form.latitude);
  const longitude = Number.parseFloat(form.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }

  const radius = Number.parseInt(form.radius, 10);
  if (!Number.isFinite(radius) || radius < 25 || radius > 2000) {
    return "Geofence radius must be between 25m and 2000m.";
  }

  if (form.screenBrandImageUrl.trim() && !isValidHttpUrl(form.screenBrandImageUrl.trim())) {
    return "Brand image URL must be a valid http(s) URL.";
  }
  if (form.screenBrandPrimary.trim() && !isValidHexColor(form.screenBrandPrimary.trim())) {
    return "Primary brand color must be a valid hex color.";
  }
  if (form.screenBrandSecondary.trim() && !isValidHexColor(form.screenBrandSecondary.trim())) {
    return "Secondary brand color must be a valid hex color.";
  }
  return null;
}

export function venueScreenPath(venueId: string): string {
  return `/venue/${encodeURIComponent(venueId)}/screen`;
}
