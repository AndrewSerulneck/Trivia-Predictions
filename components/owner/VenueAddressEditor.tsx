"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin } from "lucide-react";
import type { AddressDetails, AddressPrediction } from "@/components/admin/useAddressLookup";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";

export type VenueAddressSelection = { details: AddressDetails; addressToken: string };

type Props = {
  venueId: string;
  currentAddress?: string;
  disabled: boolean;
  onSelect: (selection: VenueAddressSelection) => void;
  onBusyChange: (busy: boolean) => void;
};

export const VenueAddressEditor = ({ venueId, currentAddress, disabled, onSelect, onBusyChange }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const sessionRef = useRef("");
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => () => { requestRef.current++; abortRef.current?.abort(); onBusyChange(false); }, [onBusyChange]);

  const invalidate = () => {
    requestRef.current++;
    abortRef.current?.abort();
    setLoading(false);
    onBusyChange(false);
    setPredictions([]);
    setError("");
    setSearched(false);
  };

  const lookup = async (input: { query: string } | { placeId: string }) => {
    invalidate();
    const requestId = requestRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    if (!sessionRef.current) sessionRef.current = crypto.randomUUID();
    setLoading(true);
    onBusyChange(true);
    try {
      const res = await fetch("/api/owner/venues/address", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ venueId, sessionToken: sessionRef.current, ...input }),
      });
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean; error?: string; code?: string; predictions?: AddressPrediction[];
        details?: AddressDetails; addressToken?: string;
      };
      if (requestRef.current !== requestId) return;
      if (res.status === 401) { router.push(ownerAuthRecoveryPath(body.code)); return; }
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Address search unavailable.");
      if ("placeId" in input) {
        if (!body.details || !body.addressToken) throw new Error("Choose the address again.");
        onSelectRef.current({ details: body.details, addressToken: body.addressToken });
        sessionRef.current = "";
        setOpen(false);
        setQuery("");
      } else {
        setPredictions(body.predictions ?? []);
        setSearched(true);
      }
    } catch (failure) {
      if (requestRef.current === requestId) setError(failure instanceof Error ? failure.message : "Address search unavailable.");
    } finally {
      if (requestRef.current === requestId) { setLoading(false); onBusyChange(false); }
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button" disabled={disabled} aria-expanded={open} aria-controls="venue-address-search"
        onClick={() => { invalidate(); if (open) sessionRef.current = ""; setOpen(!open); }}
        className="flex h-[44px] min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-footnote font-bold text-ht-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300 disabled:opacity-50"
      >
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1">Change address</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <form id="venue-address-search" className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!disabled && !loading && query.trim().length >= 3) void lookup({ query: query.trim() }); }}>
          {currentAddress ? <p className="break-words text-footnote text-ht-secondary">{currentAddress}</p> : null}
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="venue-address-query">New address</label>
            <input
              id="venue-address-query" type="search" autoComplete="street-address" maxLength={200}
              value={query} disabled={disabled} placeholder="New address"
              onChange={(event) => { invalidate(); setQuery(event.target.value); }}
              className="h-[44px] min-h-[44px] min-w-0 flex-1 rounded-xl border border-ht-soft bg-ht-elevated px-3 text-base text-ht-primary"
            />
            <button type="submit" disabled={disabled || loading || query.trim().length < 3}
              className="h-[44px] min-h-[44px] rounded-xl bg-ht-cyan-400 px-3 text-footnote font-bold text-slate-950 disabled:opacity-50">
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          {error ? <p role="alert" className="text-footnote text-ht-rose-300">{error}</p> : null}
          {searched && !loading && predictions.length === 0 ? <p role="status" className="text-footnote text-ht-secondary">No addresses found.</p> : null}
          {predictions.length ? (
            <ul className="space-y-1">
              {predictions.map((prediction) => (
                <li key={prediction.placeId}>
                  <button type="button" disabled={disabled || loading} onClick={() => void lookup({ placeId: prediction.placeId })}
                    className="min-h-[44px] w-full rounded-xl bg-ht-elevated px-3 py-[12px] text-left text-footnote text-ht-primary disabled:opacity-50">
                    {prediction.fullText}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}
    </div>
  );
};
