import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AddressDetails } from "@/lib/geolocation";
import { isUsableVenuePin } from "@/lib/venueLocationRules";

// A short-lived, owner/venue-scoped lookup result avoids a second paid Details call on save/retry.
const TOKEN_TTL_MS = 30 * 60 * 1000;
const PURPOSE = "owner-venue-address-v1";

type AddressClaim = {
  purpose: typeof PURPOSE;
  ownerId: string;
  venueId: string;
  expiresAt: number;
  details: AddressDetails;
};

export const normalizeOwnerVenueAddress = (value: unknown): AddressDetails | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const limits = { street: 300, city: 120, state: 2, zipCode: 10, country: 60, placeId: 512 } as const;
  const fields: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    if (typeof row[key] !== "string") return null;
    const text = row[key].trim();
    if (!text || text.length > max) return null;
    fields[key] = text;
  }
  if (!/^[A-Z]{2}$/.test(fields.state) || !/^\d{5}(?:-\d{4})?$/.test(fields.zipCode)) return null;
  if (!["United States", "United States of America", "US", "USA"].includes(fields.country)) return null;
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number" || !isUsableVenuePin(row.latitude, row.longitude)) return null;
  return {
    street: fields.street, city: fields.city, state: fields.state, zipCode: fields.zipCode,
    country: "United States", placeId: fields.placeId, latitude: row.latitude, longitude: row.longitude,
  };
};

const signature = (payload: string, secret: string): Buffer =>
  createHmac("sha256", secret).update(`${PURPOSE}:${payload}`).digest();

export const createOwnerVenueAddressToken = (ownerId: string, venueId: string, details: AddressDetails): string => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("Address signing unavailable");
  const normalized = normalizeOwnerVenueAddress(details);
  if (!normalized) throw new Error("Incomplete address");
  const claim: AddressClaim = { purpose: PURPOSE, ownerId, venueId, expiresAt: Date.now() + TOKEN_TTL_MS, details: normalized };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
};

export const readOwnerVenueAddressToken = (token: unknown, ownerId: string, venueId: string): AddressDetails | null => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || typeof token !== "string" || token.length > 8192) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, mac] = parts;
    const actual = Buffer.from(mac, "base64url"), expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AddressClaim;
    if (claim.purpose !== PURPOSE || claim.ownerId !== ownerId || claim.venueId !== venueId) return null;
    if (!Number.isFinite(claim.expiresAt) || claim.expiresAt <= Date.now()) return null;
    return normalizeOwnerVenueAddress(claim.details);
  } catch {
    return null;
  }
};
