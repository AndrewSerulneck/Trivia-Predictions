"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

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
  setDraggable: (draggable: boolean) => void;
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
  /** Allow inspection without pin mutation (locked preview or a save in flight). */
  readOnly?: boolean;
  /** Omit instructional copy on the compact partner page. */
  hideInstructions?: boolean;
  /**
   * Where to fetch the Google Maps JS key from. Defaults to the admin-gated
   * route; the public self-serve signup wizard passes "/api/signup/maps-key",
   * which is flag-gated + rate-limited instead of admin-authed
   * (docs/partner-self-serve-signup-plan.md §4 Phase 1). Parameterised rather
   * than forked so there is one map implementation.
   */
  mapsKeyEndpoint?: string;
};

export const ADMIN_MAPS_KEY_ENDPOINT = "/api/admin/maps-key";

export type VenueMapPickerHandle = {
  /** Re-center the map on the current pin (or a supplied position) and reset zoom to fit the radius. */
  recenter: (pos?: { lat: number; lng: number }) => void;
};

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 17;

const CIRCLE_STROKE_IDLE = 2;
const CIRCLE_STROKE_EDITING = 4;
const MAP_LOAD_TIMEOUT_MS = 20000;
const MAP_UNAVAILABLE = "Map unavailable. You can still edit using your current location.";

function loadMapsScript(apiKey: string, onReady: () => void) {
  if (window.google?.maps) {
    onReady();
    return;
  }

  if (!window.__htcMapsReadyQueue) {
    window.__htcMapsReadyQueue = [];
  }
  window.__htcMapsReadyQueue.push(onReady);

  const existingScript = document.querySelector<HTMLScriptElement>("script[data-htc-maps]");
  if (existingScript?.dataset.htcMapsFailed) {
    window.__htcMapsReadyQueue = window.__htcMapsReadyQueue.filter((fn) => fn !== onReady);
    onReady();
    return;
  }
  if (existingScript) return;

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
    script.dataset.htcMapsFailed = "1";
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
  function VenueMapPicker(
    {
      latitude,
      longitude,
      radius,
      onChange,
      radiusEditing = false,
      readOnly = false,
      hideInstructions = false,
      mapsKeyEndpoint = ADMIN_MAPS_KEY_ENDPOINT,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapDivRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<GmapsMap | null>(null);
    const markerRef = useRef<GmapsMarker | null>(null);
    const circleRef = useRef<GmapsCircle | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const readOnlyRef = useRef(readOnly);
    const positionRef = useRef({ latitude, longitude });
    const radiusRef = useRef(radius);
    useLayoutEffect(() => {
      readOnlyRef.current = readOnly;
      positionRef.current = { latitude, longitude };
      radiusRef.current = radius;
    }, [readOnly, latitude, longitude, radius]);
    const dragInProgressRef = useRef(false);
    const lastFitRadiusRef = useRef<number | null>(null);
    const pendingFitOnReleaseRef = useRef(false);
    const needsInitialFitRef = useRef(true);

    const [mapsReady, setMapsReady] = useState(false);
    const [loadError, setLoadError] = useState("");

    // Fetch API key from secure endpoint then load Maps JS script
    useEffect(() => {
      let cancelled = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        cancelled = true;
        controller.abort();
        setLoadError(MAP_UNAVAILABLE);
      }, MAP_LOAD_TIMEOUT_MS);
      const ready = () => {
        if (cancelled) return;
        clearTimeout(timeout);
        if (window.google?.maps) setMapsReady(true);
        else setLoadError(MAP_UNAVAILABLE);
      };
      void fetch(mapsKeyEndpoint, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("Map configuration unavailable");
          return res.json() as Promise<{ ok: boolean; apiKey?: string }>;
        })
        .then((data) => {
          if (cancelled) return;
          if (!data.ok || !data.apiKey) {
            clearTimeout(timeout);
            setLoadError(MAP_UNAVAILABLE);
            return;
          }
          loadMapsScript(data.apiKey, ready);
        })
        .catch(() => {
          if (!cancelled) {
            clearTimeout(timeout);
            setLoadError(MAP_UNAVAILABLE);
          }
        });
      return () => {
        cancelled = true;
        controller.abort();
        clearTimeout(timeout);
        window.__htcMapsReadyQueue = window.__htcMapsReadyQueue?.filter((fn) => fn !== ready);
      };
    }, [mapsKeyEndpoint]);

    // Initialize map once Google Maps JS is ready
    useEffect(() => {
      if (!mapsReady || !mapDivRef.current || !window.google?.maps) return;
      if (mapRef.current) return; // already initialized

      const gmaps = window.google.maps;
      const center = latitude !== null && longitude !== null
        ? { lat: latitude, lng: longitude }
        : DEFAULT_CENTER;

      try {
        const map = new gmaps.Map(mapDivRef.current, {
          center,
          zoom: DEFAULT_ZOOM,
          mapTypeId: "roadmap",
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;

        const marker = new gmaps.Marker({
          position: center,
          map,
          draggable: !readOnlyRef.current,
          title: readOnlyRef.current ? "Venue pin" : "Drag to set venue pin",
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
          if (readOnlyRef.current) return;
          dragInProgressRef.current = true;
        });

        marker.addListener("dragend", () => {
          if (readOnlyRef.current) {
            dragInProgressRef.current = false;
            const current = positionRef.current;
            if (current.latitude !== null && current.longitude !== null) {
              const pos = { lat: current.latitude, lng: current.longitude };
              marker.setPosition(pos);
              circle.setCenter(pos);
            }
            return;
          }
          const pos = marker.getPosition();
          if (!pos) return;
          const lat = pos.lat();
          const lng = pos.lng();
          circle.setCenter({ lat, lng });
          onChangeRef.current(lat, lng);
          // Allow one render cycle for parent state to update before re-enabling sync
          setTimeout(() => { dragInProgressRef.current = false; }, 100);
        });
      } catch {
        setLoadError(MAP_UNAVAILABLE);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapsReady]);

    useEffect(() => {
      markerRef.current?.setDraggable(!readOnly);
      if (readOnly) dragInProgressRef.current = false;
    }, [readOnly, mapsReady]);

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
      if (!needsInitialFitRef.current && window.google?.maps) {
        fitToCircle(mapRef.current, circleRef.current, window.google.maps);
      }
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
      if (radiusEditing || needsInitialFitRef.current) {
        pendingFitOnReleaseRef.current = true;
        return;
      }
      lastFitRadiusRef.current = radius;
      pendingFitOnReleaseRef.current = false;
      fitToCircle(map, circle, window.google.maps);
    }, [radius, radiusEditing]);

    // Fire the deferred refit exactly once when the dial is released, if a material
    // change was skipped while `radiusEditing` was true.
    useEffect(() => {
      if (radiusEditing) return;
      if (needsInitialFitRef.current) return;
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
        if (needsInitialFitRef.current && circleRef.current) {
          needsInitialFitRef.current = false;
          lastFitRadiusRef.current = radiusRef.current;
          pendingFitOnReleaseRef.current = false;
          fitToCircle(map, circleRef.current, gmaps);
          return;
        }
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
          return;
        }
        // First time the container has a real size (covers both "was hidden,
        // now visible" and "sheet resized to inline card") — force Maps to
        // recompute its internal size, or it renders grey/blank.
        triggerResize();
      });
      observer.observe(el);
      const size = el.getBoundingClientRect();
      if (size.width > 0 && size.height > 0) triggerResize();

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
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {hideInstructions ? "Map unavailable." : loadError}
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
        {!readOnly && !hideInstructions && (
          <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Drag the red pin to the exact venue entrance. The blue circle shows the geofence boundary and updates as you change the radius.
          </p>
        )}
      </div>
    );
  },
);
