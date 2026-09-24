export type WeatherSnapshot = {
  location: "当前位置";
  current: {
    temperatureC: number;
    weatherCode: number;
    isDay: boolean;
    observedAt: string | null;
    description: string;
  };
  today: {
    date: string;
    minC: number;
    maxC: number;
  };
  checkedAt: number;
};

export type WeatherApiState = {
  status: "ready" | "unavailable";
  checkedAt: number | null;
  data: WeatherSnapshot | null;
};

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
}

function asObservedTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value.trim() : null;
}

export function weatherDescription(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 99) return "天气不可用";
  if (code === 0) return "晴";
  if (code >= 1 && code <= 3) return "多云";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code === 85 || code === 86) return "阵雪";
  if (code >= 95 && code <= 99) return "雷雨";
  return "天气";
}

export function parseOpenMeteoWeather(payload: unknown, checkedAt = Date.now()): WeatherSnapshot | null {
  const root = asRecord(payload);
  const current = asRecord(root?.current);
  const daily = asRecord(root?.daily);
  const temperatureC = asFiniteNumber(current?.temperature_2m);
  const weatherCode = asFiniteNumber(current?.weather_code);
  const isDay = asFiniteNumber(current?.is_day);
  const dates = daily?.time;
  const maximums = daily?.temperature_2m_max;
  const minimums = daily?.temperature_2m_min;
  const date = Array.isArray(dates) ? asDateKey(dates[0]) : null;
  const maxC = Array.isArray(maximums) ? asFiniteNumber(maximums[0]) : null;
  const minC = Array.isArray(minimums) ? asFiniteNumber(minimums[0]) : null;
  if (temperatureC === null || weatherCode === null || !Number.isInteger(weatherCode) || weatherCode < 0 || weatherCode > 99 ||
    (isDay !== 0 && isDay !== 1) || date === null || maxC === null || minC === null || !Number.isFinite(checkedAt) || checkedAt <= 0) return null;
  return parseWeatherSnapshot({
    location: "当前位置",
    current: {
      temperatureC,
      weatherCode,
      isDay: isDay === 1,
      observedAt: asObservedTime(current?.time),
      description: weatherDescription(weatherCode),
    },
    today: { date, minC, maxC },
    checkedAt: Math.round(checkedAt),
  });
}

function parseWeatherSnapshot(payload: unknown): WeatherSnapshot | null {
  const root = asRecord(payload);
  const current = asRecord(root?.current);
  const today = asRecord(root?.today);
  const temperatureC = asFiniteNumber(current?.temperatureC);
  const weatherCode = asFiniteNumber(current?.weatherCode);
  const isDay = current?.isDay;
  const date = asDateKey(today?.date);
  const minC = asFiniteNumber(today?.minC);
  const maxC = asFiniteNumber(today?.maxC);
  const checkedAt = asFiniteNumber(root?.checkedAt);
  const description = typeof current?.description === "string" && current.description.trim() ? current.description.trim() : null;
  const observedAt = current?.observedAt === null ? null : asObservedTime(current?.observedAt);
  if (root?.location !== "当前位置" || temperatureC === null || weatherCode === null || !Number.isInteger(weatherCode) || weatherCode < 0 || weatherCode > 99 ||
    typeof isDay !== "boolean" || date === null || minC === null || maxC === null || description === null ||
    current?.observedAt !== null && observedAt === null || checkedAt === null || checkedAt <= 0) return null;
  return {
    location: "当前位置",
    current: { temperatureC, weatherCode, isDay, observedAt, description },
    today: { date, minC, maxC },
    checkedAt: Math.round(checkedAt),
  };
}

export function parseWeatherApiState(payload: unknown): WeatherApiState | null {
  const record = asRecord(payload);
  if (!record || (record.status !== "ready" && record.status !== "unavailable")) return null;
  if (record.status === "unavailable") {
    return record.checkedAt === null && record.data === null ? { status: "unavailable", checkedAt: null, data: null } : null;
  }
  const checkedAt = asFiniteNumber(record.checkedAt);
  const data = parseWeatherSnapshot(record.data);
  if (checkedAt === null || checkedAt <= 0 || data === null) return null;
  return { status: "ready", checkedAt: Math.round(checkedAt), data };
}
