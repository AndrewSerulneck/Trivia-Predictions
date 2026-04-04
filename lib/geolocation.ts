export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type CurrentLocationOptions = {
  forceFresh?: boolean;
};

export async function getCurrentLocation(options: CurrentLocationOptions = {}): Promise<Coordinates> {
  const forceFresh = Boolean(options.forceFresh);
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
        }),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: forceFresh ? 15000 : 8000,
        maximumAge: forceFresh ? 0 : 30000,
      }
    );
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
