"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

declare global {
  interface Window {
    google?: GmapsGlobal;
    __htcMapsReadyQueue?: Array<() => void>;
    __htcMapsCallback?: () => void;
  }
}

type GmapsLatLng = { lat: () => number; lng: () => number };
type GmapsMap = {
  panTo: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  fitBounds: (bounds: GmapsLatLngBounds, padding?: number) => void;
};
type GmapsLatLngBounds = {
  extend: (pos: { lat: number; lng: number }) => void;
};
type GmapsMarker = {
  setPosition: (pos: { lat: number; lng: number }) => void;
  getPosition: () => GmapsLatLng | null;
  addListener: (event: string, handler: () => void) => void;
};
type GmapsCircle = {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setRadius: (r: number) => void;
  setOptions: (opts: object) => void;
  getBounds: () => GmapsLatLngBounds | null;
};
type GmapsGlobal = {
  maps: {
    Map: new (el: HTMLElement, opts: object) => GmapsMap;
    Marker: new (opts: object) => GmapsMarker;
    Circle: new (opts: object) => GmapsCircle;
    LatLngBounds: new () => GmapsLatLngBounds;
    event: {
      trigger: (instance: unknown, eventName: string) => void;
    };
  };
};

type VenueMapPickerProps = {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
  /** True while the radius dial is actively being dragged — thickens the circle stroke. */
  radiusEditing?: boolean;
};

export type VenueMapPickerHandle = {
  /** Re-center the map on the current pin (or a supplied position) and reset zoom to fit the radius. */
  recenter: (pos?: { lat: number; lng: number }) => void;
};

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 17;

const CIRCLE_STROKE_IDLE = 2;
const CIRCLE_STROKE_EDITING = 4;

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

/**
 * Fit the map's zoom to the circle's bounds so a large-radius geofence doesn't
 * overflow a map framed at DEFAULT_ZOOM. Called on init and whenever radius
 * changes materially — never mid-drag, so it doesn't fight a user's manual pan/zoom.
 */
function fitToCircle(map: GmapsMap, circle: GmapsCircle, gmaps: GmapsGlobal["maps"]) {
  const bounds = circle.getBounds();
  if (!bounds) return;
  // ~70% viewport fill: pad the bounds outward before fitting so the circle
  // doesn't touch the map edges.
  map.fitBounds(bounds, 40);
  void gmaps;
}

export const VenueMapPicker = forwardRef<VenueMapPickerHandle, VenueMapPickerProps>(
  function VenueMapPicker({ latitude, longitude, radius, onChange, radiusEditing = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapDivRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<GmapsMap | null>(null);
    const markerRef = useRef<GmapsMarker | null>(null);
    const circleRef = useRef<GmapsCircle | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const dragInProgressRef = useRef(false);
    const lastFitRadiusRef = useRef<number | null>(null);
    const pendingFitOnReleaseRef = useRef(false);
    const hasResizedSinceVisibleRef = useRef(false);

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
        strokeWeight: CIRCLE_STROKE_IDLE,
        fillColor: "#4f46e5",
        fillOpacity: 0.12,
      });
      circleRef.current = circle;
      lastFitRadiusRef.current = radius;

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

    // Update circle radius, and refit zoom when it changes materially (not mid-drag).
    // Skipped while `radiusEditing` is true so the dial doesn't fight the user's finger;
    // `pendingFitOnReleaseRef` remembers a skipped-but-material change and fires it once
    // when editing ends, so a big drag still ends framed without double-fitting or
    // permanently suppressing later fits.
    useEffect(() => {
      const circle = circleRef.current;
      const map = mapRef.current;
      if (!circle) return;
      circle.setRadius(radius);
      if (!map || !window.google?.maps) return;
      if (dragInProgressRef.current) return;
      const lastFit = lastFitRadiusRef.current;
      const changedMaterially = lastFit === null || Math.abs(radius - lastFit) / lastFit > 0.15;
      if (!changedMaterially) return;
      if (radiusEditing) {
        pendingFitOnReleaseRef.current = true;
        return;
      }
      lastFitRadiusRef.current = radius;
      fitToCircle(map, circle, window.google.maps);
    }, [radius, radiusEditing]);

    // Fire the deferred refit exactly once when the dial is released, if a material
    // change was skipped while `radiusEditing` was true.
    useEffect(() => {
      if (radiusEditing) return;
      if (!pendingFitOnReleaseRef.current) return;
      pendingFitOnReleaseRef.current = false;
      const circle = circleRef.current;
      const map = mapRef.current;
      if (!circle || !map || !window.google?.maps) return;
      lastFitRadiusRef.current = radius;
      fitToCircle(map, circle, window.google.maps);
    }, [radiusEditing, radius]);

    // Thicken the circle stroke while the radius dial is actively being dragged,
    // so the circle reads as the object currently being edited.
    useEffect(() => {
      circleRef.current?.setOptions({
        strokeWeight: radiusEditing ? CIRCLE_STROKE_EDITING : CIRCLE_STROKE_IDLE,
      });
    }, [radiusEditing]);

    // Handle container resize: Google Maps blanks out grey if it's sized while
    // hidden (e.g. mounted inline inside a card that starts at zero height before
    // layout settles) or if its container is resized after init (sheet -> inline
    // card transitions). Trigger the `resize` event and re-center whenever the
    // container's size actually changes.
    useEffect(() => {
      if (!mapsReady || !containerRef.current) return;
      const el = containerRef.current;

      const triggerResize = () => {
        const map = mapRef.current;
        const gmaps = window.google?.maps;
        if (!map || !gmaps) return;
        gmaps.event.trigger(map, "resize");
        const pos = markerRef.current?.getPosition();
        if (pos) {
          map.panTo({ lat: pos.lat(), lng: pos.lng() });
        } else if (latitude !== null && longitude !== null) {
          map.panTo({ lat: latitude, lng: longitude });
        }
      };

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) {
          hasResizedSinceVisibleRef.current = false;
          return;
        }
        // First time the container has a real size (covers both "was hidden,
        // now visible" and "sheet resized to inline card") — force Maps to
        // recompute its internal size, or it renders grey/blank.
        if (!hasResizedSinceVisibleRef.current) {
          hasResizedSinceVisibleRef.current = true;
        }
        triggerResize();
      });
      observer.observe(el);

      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapsReady]);

    useImperativeHandle(ref, () => ({
      recenter: (pos) => {
        const map = mapRef.current;
        const circle = circleRef.current;
        const marker = markerRef.current;
        const gmaps = window.google?.maps;
        if (!map || !gmaps) return;
        const target = pos
          ?? (latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null);
        if (!target) return;
        marker?.setPosition(target);
        circle?.setCenter(target);
        map.panTo(target);
        if (circle) fitToCircle(map, circle, gmaps);
      },
    }), [latitude, longitude]);

    if (loadError) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {loadError}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="overflow-hidden rounded-lg border border-slate-200">
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
  },
);
