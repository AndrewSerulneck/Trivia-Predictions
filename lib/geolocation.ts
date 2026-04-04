export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

export type CurrentLocationOptions = {
  forceFresh?: boolean;
  timeoutMs?: number;
};

export async function getCurrentLocation(options: CurrentLocationOptions = {}): Promise<Coordinates> {
  const forceFresh = Boolean(options.forceFresh);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Number(options.timeoutMs)) : (forceFresh ? 15000 : 8000);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: forceFresh ? 0 : 30000,
      }
    );
  });
}

export type BestLocationOptions = {
  forceFresh?: boolean;
  sampleDurationMs?: number;
  timeoutMs?: number;
  desiredAccuracyMeters?: number;
};

export async function getBestCurrentLocation(options: BestLocationOptions = {}): Promise<Coordinates> {
  const forceFresh = Boolean(options.forceFresh);
  const sampleDurationMs = Number.isFinite(options.sampleDurationMs)
    ? Math.max(1500, Number(options.sampleDurationMs))
    : 7000;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(sampleDurationMs, Number(options.timeoutMs))
    : Math.max(sampleDurationMs, 16000);
  const desiredAccuracyMeters = Number.isFinite(options.desiredAccuracyMeters)
    ? Math.max(5, Number(options.desiredAccuracyMeters))
    : 75;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    let settled = false;
    let best: Coordinates | null = null;
    const startedAt = Date.now();
    let watchId: number | null = null;

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (best) {
        resolve(best);
        return;
      }
      reject(error instanceof Error ? error : new Error("Unable to determine location."));
    };

    const evaluate = (position: GeolocationPosition) => {
      const candidate: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };

      if (!best) {
        best = candidate;
      } else {
        const bestAccuracy = Number.isFinite(best.accuracy) ? (best.accuracy as number) : Number.POSITIVE_INFINITY;
        const nextAccuracy = Number.isFinite(candidate.accuracy) ? (candidate.accuracy as number) : Number.POSITIVE_INFINITY;
        if (nextAccuracy < bestAccuracy || (nextAccuracy === bestAccuracy && (candidate.timestamp ?? 0) > (best.timestamp ?? 0))) {
          best = candidate;
        }
      }

      const elapsed = Date.now() - startedAt;
      const bestAccuracy = Number.isFinite(best.accuracy) ? (best.accuracy as number) : Number.POSITIVE_INFINITY;
      if (elapsed >= 1200 && bestAccuracy <= desiredAccuracyMeters) {
        finish();
      }
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => evaluate(position),
      (error) => finish(error),
      {
        enableHighAccuracy: true,
        maximumAge: forceFresh ? 0 : 5000,
        timeout: timeoutMs,
      }
    );

    globalThis.setTimeout(() => finish(), sampleDurationMs);
    globalThis.setTimeout(() => finish(new Error("Location request timed out.")), timeoutMs + 250);
  });
}

export function calculateDistanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return earthRadius * c;
}
