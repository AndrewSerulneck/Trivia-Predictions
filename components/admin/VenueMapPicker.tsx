"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: GmapsGlobal;
    __htcMapsReadyQueue?: Array<() => void>;
    __htcMapsCallback?: () => void;
  }
}

type GmapsLatLng = { lat: () => number; lng: () => number };
type GmapsMap = { panTo: (pos: { lat: number; lng: number }) => void };
type GmapsMarker = {
  setPosition: (pos: { lat: number; lng: number }) => void;
  getPosition: () => GmapsLatLng | null;
  addListener: (event: string, handler: () => void) => void;
};
type GmapsCircle = {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setRadius: (r: number) => void;
};
type GmapsGlobal = {
  maps: {
    Map: new (el: HTMLElement, opts: object) => GmapsMap;
    Marker: new (opts: object) => GmapsMarker;
    Circle: new (opts: object) => GmapsCircle;
  };
};

type VenueMapPickerProps = {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
};

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 17;

function loadMapsScript(apiKey: string, onReady: () => void) {
  if (window.google?.maps) {
    onReady();
    return;
  }

  if (!window.__htcMapsReadyQueue) {
    window.__htcMapsReadyQueue = [];
  }
  window.__htcMapsReadyQueue.push(onReady);

  if (document.querySelector("script[data-htc-maps]")) return;

  window.__htcMapsCallback = () => {
    const queue = window.__htcMapsReadyQueue ?? [];
    window.__htcMapsReadyQueue = [];
    queue.forEach((fn) => fn());
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__htcMapsCallback`;
  script.async = true;
  script.defer = true;
  script.setAttribute("data-htc-maps", "1");
  script.onerror = () => {
    const queue = window.__htcMapsReadyQueue ?? [];
    window.__htcMapsReadyQueue = [];
    queue.forEach((fn) => fn());
  };
  document.head.appendChild(script);
}

export function VenueMapPicker({ latitude, longitude, radius, onChange }: VenueMapPickerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GmapsMap | null>(null);
  const markerRef = useRef<GmapsMarker | null>(null);
  const circleRef = useRef<GmapsCircle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dragInProgressRef = useRef(false);

  const [mapsReady, setMapsReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Fetch API key from secure endpoint then load Maps JS script
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/maps-key")
      .then((res) => res.json() as Promise<{ ok: boolean; apiKey?: string; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (!data.ok || !data.apiKey) {
          setLoadError(data.error ?? "Maps key unavailable.");
          return;
        }
        loadMapsScript(data.apiKey, () => {
          if (!cancelled) setMapsReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load map configuration.");
      });
    return () => { cancelled = true; };
  }, []);

  // Initialize map once Google Maps JS is ready
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || !window.google?.maps) return;
    if (mapRef.current) return; // already initialized

    const gmaps = window.google.maps;
    const center = latitude !== null && longitude !== null
      ? { lat: latitude, lng: longitude }
      : DEFAULT_CENTER;

    const map = new gmaps.Map(mapDivRef.current, {
      center,
      zoom: DEFAULT_ZOOM,
      mapTypeId: "roadmap",
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    const marker = new gmaps.Marker({
      position: center,
      map,
      draggable: true,
      title: "Drag to set venue pin",
    });
    markerRef.current = marker;

    const circle = new gmaps.Circle({
      map,
      center,
      radius,
      strokeColor: "#4f46e5",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#4f46e5",
      fillOpacity: 0.12,
    });
    circleRef.current = circle;

    marker.addListener("dragstart", () => {
      dragInProgressRef.current = true;
    });

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      const lat = pos.lat();
      const lng = pos.lng();
      circle.setCenter({ lat, lng });
      onChangeRef.current(lat, lng);
      // Allow one render cycle for parent state to update before re-enabling sync
      setTimeout(() => { dragInProgressRef.current = false; }, 100);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady]);

  // Sync marker and map center when coordinates change externally (address lookup).
  // Skip when the change originated from a drag so the pin doesn't snap back.
  useEffect(() => {
    if (dragInProgressRef.current) return;
    if (!markerRef.current || !circleRef.current || !mapRef.current) return;
    if (latitude === null || longitude === null) return;
    const pos = { lat: latitude, lng: longitude };
    markerRef.current.setPosition(pos);
    circleRef.current.setCenter(pos);
    mapRef.current.panTo(pos);
  }, [latitude, longitude]);

  // Update circle radius
  useEffect(() => {
    circleRef.current?.setRadius(radius);
  }, [radius]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        {loadError}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      {!mapsReady && (
        <div className="flex h-80 items-center justify-center bg-slate-50 text-xs text-slate-400">
          Loading map...
        </div>
      )}
      <div ref={mapDivRef} className={`h-80 w-full${mapsReady ? "" : " hidden"}`} />
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Drag the red pin to the exact venue entrance. The blue circle shows the geofence boundary and updates as you change the radius.
      </p>
    </div>
  );
}
