export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

export async function getCurrentLocation(): Promise<Coordinates> {
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
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

export type BestLocationOptions = {
  sampleDurationMs?: number;
  timeoutMs?: number;
  desiredAccuracyMeters?: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export async function getBestCurrentLocation(options: BestLocationOptions = {}): Promise<Coordinates> {
  const sampleDurationMs = Number.isFinite(options.sampleDurationMs)
    ? Math.max(2500, Number(options.sampleDurationMs))
    : 9000;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(sampleDurationMs + 1000, Number(options.timeoutMs))
    : 18000;
  const desiredAccuracyMeters = Number.isFinite(options.desiredAccuracyMeters)
    ? Math.max(5, Number(options.desiredAccuracyMeters))
    : 60;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    let settled = false;
    let watchId: number | null = null;
    const samples: Coordinates[] = [];
    const startedAt = Date.now();

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      if (samples.length > 0) {
        const latMedian = median(samples.map((item) => item.latitude));
        const lonMedian = median(samples.map((item) => item.longitude));
        const bestAccuracy = samples.reduce((best, current) => {
          const currentAccuracy = Number.isFinite(current.accuracy) ? (current.accuracy as number) : Number.POSITIVE_INFINITY;
          const bestAccuracyValue = Number.isFinite(best.accuracy) ? (best.accuracy as number) : Number.POSITIVE_INFINITY;
          return currentAccuracy < bestAccuracyValue ? current : best;
        }, samples[0]);

        resolve({
          latitude: latMedian,
          longitude: lonMedian,
          accuracy: bestAccuracy.accuracy,
          timestamp: Date.now(),
        });
        return;
      }

      reject(error instanceof Error ? error : new Error("Unable to determine location."));
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        samples.push({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });

        const elapsed = Date.now() - startedAt;
        if (elapsed >= 1500 && position.coords.accuracy <= desiredAccuracyMeters) {
          finish();
        }
      },
      (error) => finish(error),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );

    globalThis.setTimeout(() => finish(), sampleDurationMs);
    globalThis.setTimeout(() => finish(new Error("Location request timed out.")), timeoutMs + 500);
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
