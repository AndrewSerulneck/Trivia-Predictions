"use client";

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { GeographicHierarchy } from "@/lib/geographicHierarchy";

export type AdGeoSelectionLevel = "all" | "region" | "state" | "city" | "zip" | "venue";

export type AdGeoSelection = {
  level: AdGeoSelectionLevel;
  regionKey?: string;
  stateCode?: string;
  cityName?: string;
  zipCode?: string;
  venueId?: string;
};

export type AdGeoCountMap = Record<string, number>;

export type AdGeographicFilterProps = {
  hierarchy: GeographicHierarchy | null;
  loading?: boolean;
  counts?: AdGeoCountMap;
  selectedRegion?: string;
  selectedState?: string;
  selectedCity?: string;
  selectedZipCode?: string;
  selectedVenue?: string;
  onSelectRegion: (regionKey: string) => void;
  onSelectState: (stateCode: string) => void;
  onSelectCity: (cityName: string, stateCode: string) => void;
  onSelectZipCode: (zipCode: string, cityName: string, stateCode: string) => void;
  onSelectVenue: (venueId: string, zipCode: string, cityName: string, stateCode: string) => void;
  onClear: () => void;
};

function countKey(level: AdGeoSelectionLevel, parts: string[]): string {
  return `${level}:${parts.join("::")}`;
}

function CountBadge({ value }: { value: number }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{value}</span>;
}

function Arrow({ open }: { open: boolean }) {
  return <span className="inline-block w-3 text-slate-500">{open ? "▼" : "►"}</span>;
}

function RowButton({
  selected,
  indentClass,
  label,
  count,
  onClick,
  leading,
}: {
  selected: boolean;
  indentClass: string;
  label: string;
  count: number;
  onClick: () => void;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
        indentClass,
        selected ? "bg-indigo-100 text-indigo-800" : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        {leading}
        <span className="truncate">{label}</span>
      </span>
      <CountBadge value={count} />
    </button>
  );
}

export function AdGeographicFilter({
  hierarchy,
  loading = false,
  counts = {},
  selectedRegion,
  selectedState,
  selectedCity,
  selectedZipCode,
  selectedVenue,
  onSelectRegion,
  onSelectState,
  onSelectCity,
  onSelectZipCode,
  onSelectVenue,
  onClear,
}: AdGeographicFilterProps) {
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openStates, setOpenStates] = useState<Set<string>>(new Set());
  const [openCities, setOpenCities] = useState<Set<string>>(new Set());
  const [openZips, setOpenZips] = useState<Set<string>>(new Set());

  const allCount = useMemo(() => counts[countKey("all", ["all"])] ?? 0, [counts]);

  const toggle = (setter: Dispatch<SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Geographic Filter</h3>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {loading ? (
        <p className="px-2 py-6 text-sm text-slate-500">Loading geography...</p>
      ) : !hierarchy ? (
        <p className="px-2 py-6 text-sm text-slate-500">No hierarchy data available.</p>
      ) : (
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          <RowButton
            selected={!selectedRegion && !selectedState && !selectedCity && !selectedZipCode && !selectedVenue}
            indentClass=""
            label="All Locations"
            count={allCount}
            onClick={onClear}
          />

          {hierarchy.regions.map((region) => {
            const regionOpen = openRegions.has(region.regionKey) || selectedRegion === region.regionKey;
            const regionSelected = selectedRegion === region.regionKey && !selectedState && !selectedCity && !selectedZipCode && !selectedVenue;
            const regionCount = counts[countKey("region", [region.regionKey])] ?? 0;
            return (
              <div key={region.regionKey} className="space-y-1">
                <RowButton
                  selected={regionSelected}
                  indentClass=""
                  label={region.name}
                  count={regionCount}
                  leading={
                    <span
                      className="inline-flex items-center"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(setOpenRegions, region.regionKey);
                      }}
                      role="button"
                    >
                      <Arrow open={regionOpen} />
                    </span>
                  }
                  onClick={() => {
                    onSelectRegion(region.regionKey);
                  }}
                />

                {regionOpen
                  ? region.states.map((state) => {
                      const stateOpen = openStates.has(state.stateCode) || selectedState === state.stateCode;
                      const stateSelected = selectedState === state.stateCode && !selectedCity && !selectedZipCode && !selectedVenue;
                      const stateCount = counts[countKey("state", [state.stateCode])] ?? 0;
                      return (
                        <div key={`${region.regionKey}-${state.stateCode}`} className="space-y-1">
                          <RowButton
                            selected={stateSelected}
                            indentClass="ml-4"
                            label={state.stateCode}
                            count={stateCount}
                            leading={
                              <span
                                className="inline-flex items-center"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggle(setOpenStates, state.stateCode);
                                }}
                                role="button"
                              >
                                <Arrow open={stateOpen} />
                              </span>
                            }
                            onClick={() => {
                              onSelectState(state.stateCode);
                            }}
                          />

                          {stateOpen
                            ? state.cities.map((city) => {
                                const cityOpenKey = `${state.stateCode}::${city.city}`;
                                const cityOpen =
                                  openCities.has(cityOpenKey) ||
                                  (selectedState === state.stateCode && selectedCity === city.city);
                                const citySelected = selectedState === state.stateCode && selectedCity === city.city && !selectedZipCode && !selectedVenue;
                                const cityCount = counts[countKey("city", [state.stateCode, city.city])] ?? 0;
                                return (
                                  <div key={cityOpenKey} className="space-y-1">
                                    <RowButton
                                      selected={citySelected}
                                      indentClass="ml-8"
                                      label={city.city}
                                      count={cityCount}
                                      leading={
                                        <span
                                          className="inline-flex items-center"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            toggle(setOpenCities, cityOpenKey);
                                          }}
                                          role="button"
                                        >
                                          <Arrow open={cityOpen} />
                                        </span>
                                      }
                                      onClick={() => {
                                        onSelectCity(city.city, state.stateCode);
                                      }}
                                    />

                                    {cityOpen
                                      ? city.zipCodes.map((zip) => {
                                          const zipOpenKey = `${state.stateCode}::${city.city}::${zip.zipCode}`;
                                          const zipOpen =
                                            openZips.has(zipOpenKey) ||
                                            (selectedState === state.stateCode &&
                                              selectedCity === city.city &&
                                              selectedZipCode === zip.zipCode);
                                          const zipSelected =
                                            selectedState === state.stateCode &&
                                            selectedCity === city.city &&
                                            selectedZipCode === zip.zipCode &&
                                            !selectedVenue;
                                          const zipCount =
                                            counts[countKey("zip", [state.stateCode, city.city, zip.zipCode])] ?? 0;

                                          return (
                                            <div key={zipOpenKey} className="space-y-1">
                                              <RowButton
                                                selected={zipSelected}
                                                indentClass="ml-12"
                                                label={zip.zipCode}
                                                count={zipCount}
                                                leading={
                                                  <span
                                                    className="inline-flex items-center"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      toggle(setOpenZips, zipOpenKey);
                                                    }}
                                                    role="button"
                                                  >
                                                    <Arrow open={zipOpen} />
                                                  </span>
                                                }
                                                onClick={() => {
                                                  onSelectZipCode(zip.zipCode, city.city, state.stateCode);
                                                }}
                                              />

                                              {zipOpen
                                                ? zip.venues.map((venue) => {
                                                    const venueSelected = selectedVenue === venue.id;
                                                    const venueCount = counts[countKey("venue", [venue.id])] ?? 0;
                                                    return (
                                                      <RowButton
                                                        key={venue.id}
                                                        selected={venueSelected}
                                                        indentClass="ml-16"
                                                        label={`${venue.name} ${venue.addressLabel ? `• ${venue.addressLabel}` : ""}`}
                                                        count={venueCount}
                                                        onClick={() => {
                                                          onSelectVenue(venue.id, zip.zipCode, city.city, state.stateCode);
                                                        }}
                                                      />
                                                    );
                                                  })
                                                : null}
                                            </div>
                                          );
                                        })
                                      : null}
                                  </div>
                                );
                              })
                            : null}
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
