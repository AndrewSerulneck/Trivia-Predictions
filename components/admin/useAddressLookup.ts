"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Google Places autocomplete, session-token accounting included. Extracted from
// VenuesSection's venue form in admin-mobile Phase 4 so the desktop form and the
// mobile Activate-a-Venue flow share one implementation (and one billing
// session) rather than drifting apart.

export type AddressPrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

export type AddressDetails = {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

const LOOKUP_INACTIVITY_MS = 5 * 60 * 1000;
const PREDICT_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

function createSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 36);
  }
  return Math.random().toString(36).slice(2).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
}

export type AddressLookup = {
  query: string;
  predictions: AddressPrediction[];
  open: boolean;
  loading: boolean;
  error: string;
  /** True once a query ran and Places came back with nothing to offer. */
  noResults: boolean;
  setQuery: (value: string) => void;
  handleInput: (value: string) => void;
  openIfPredictions: () => void;
  close: () => void;
  reset: () => void;
  clearError: () => void;
  /** Resolves the prediction to full address details, or null on failure. */
  select: (prediction: AddressPrediction) => Promise<AddressDetails | null>;
};

export function useAddressLookup(): AddressLookup {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noResults, setNoResults] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>("");
  const lastSessionActivityRef = useRef<number>(0);
  const requestIdRef = useRef(0);

  const ensureSessionToken = useCallback(() => {
    const now = Date.now();
    if (!sessionTokenRef.current || now - lastSessionActivityRef.current > LOOKUP_INACTIVITY_MS) {
      sessionTokenRef.current = createSessionToken();
    }
    lastSessionActivityRef.current = now;
    return sessionTokenRef.current;
  }, []);

  const loadPredictions = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setPredictions([]);
        setOpen(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError("");
      try {
        const sessionToken = ensureSessionToken();
        const response = await fetch("/api/geolocation/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, sessionToken }),
        });
        const payload = (await response.json()) as { ok: boolean; predictions?: AddressPrediction[]; error?: string };
        if (requestIdRef.current !== requestId) return;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to load address predictions.");
        }
        const next = payload.predictions ?? [];
        setPredictions(next);
        setOpen(next.length > 0);
        setNoResults(next.length === 0);
      } catch (lookupErr) {
        if (requestIdRef.current !== requestId) return;
        setPredictions([]);
        setOpen(false);
        setNoResults(false);
        setError(lookupErr instanceof Error ? lookupErr.message : "Address lookup is unavailable right now.");
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [ensureSessionToken]
  );

  const handleInput = useCallback(
    (raw: string) => {
      setQuery(raw);
      setError("");
      setNoResults(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (raw.trim().length < MIN_QUERY_LENGTH) {
        setPredictions([]);
        setOpen(false);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void loadPredictions(raw);
      }, PREDICT_DEBOUNCE_MS);
    },
    [loadPredictions]
  );

  const select = useCallback(
    async (prediction: AddressPrediction): Promise<AddressDetails | null> => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError("");
      try {
        const sessionToken = ensureSessionToken();
        const response = await fetch("/api/geolocation/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: prediction.placeId, sessionToken }),
        });
        const payload = (await response.json()) as { ok: boolean; details?: AddressDetails; error?: string };
        if (requestIdRef.current !== requestId) return null;
        if (!response.ok || !payload.ok || !payload.details) {
          throw new Error(payload.error ?? "Failed to resolve address details.");
        }
        setQuery(prediction.fullText || [prediction.mainText, prediction.secondaryText].filter(Boolean).join(", "));
        setPredictions([]);
        setOpen(false);
        setNoResults(false);
        lastSessionActivityRef.current = Date.now();
        return payload.details;
      } catch (lookupErr) {
        if (requestIdRef.current !== requestId) return null;
        setError(lookupErr instanceof Error ? lookupErr.message : "Failed to resolve address.");
        return null;
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [ensureSessionToken]
  );

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setQuery("");
    setPredictions([]);
    setOpen(false);
    setError("");
    setNoResults(false);
    setLoading(false);
    sessionTokenRef.current = "";
    lastSessionActivityRef.current = 0;
  }, []);

  const hasPredictions = predictions.length > 0;
  const openIfPredictions = useCallback(() => {
    ensureSessionToken();
    if (hasPredictions) setOpen(true);
  }, [ensureSessionToken, hasPredictions]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query,
    predictions,
    open,
    loading,
    error,
    noResults,
    setQuery,
    handleInput,
    openIfPredictions,
    close: useCallback(() => setOpen(false), []),
    reset,
    clearError: useCallback(() => setError(""), []),
    select,
  };
}
