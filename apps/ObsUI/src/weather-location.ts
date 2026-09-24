export type WeatherCoordinates = {
  latitude: number;
  longitude: number;
};

export const WEATHER_LOCATION_STORAGE_KEY = "obsui.weather-location.v1";
const coordinatePrecision = 2;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidCoordinates(value: unknown): value is WeatherCoordinates {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Record<string, unknown>;
  return typeof coordinates.latitude === "number" && Number.isFinite(coordinates.latitude) && coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    typeof coordinates.longitude === "number" && Number.isFinite(coordinates.longitude) && coordinates.longitude >= -180 && coordinates.longitude <= 180;
}

function asCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10 ** coordinatePrecision) / 10 ** coordinatePrecision;
}

export function parseWeatherCoordinates(value: unknown): WeatherCoordinates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const coordinates = { latitude: asCoordinate(record.latitude), longitude: asCoordinate(record.longitude) };
  if (!isValidCoordinates(coordinates)) return null;
  return { latitude: roundCoordinate(coordinates.latitude), longitude: roundCoordinate(coordinates.longitude) };
}

export function readStoredWeatherLocation(storage: StorageLike | null = browserStorage()): WeatherCoordinates | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WEATHER_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    return parseWeatherCoordinates(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWeatherLocation(coordinates: WeatherCoordinates, storage: StorageLike | null = browserStorage()): void {
  if (!storage || !isValidCoordinates(coordinates)) return;
  try {
    storage.setItem(WEATHER_LOCATION_STORAGE_KEY, JSON.stringify({
      latitude: roundCoordinate(coordinates.latitude),
      longitude: roundCoordinate(coordinates.longitude),
    }));
  } catch {
    // Weather remains available for the current session when browser storage is blocked.
  }
}
