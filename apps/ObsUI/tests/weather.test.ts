import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenMeteoWeather, parseWeatherApiState, weatherDescription } from "../src/weather";
import { parseWeatherCoordinates, readStoredWeatherLocation, saveWeatherLocation, WEATHER_LOCATION_STORAGE_KEY } from "../src/weather-location";

const forecast = {
  current: { time: "2026-09-07T12:00", temperature_2m: 27.4, weather_code: 2, is_day: 1 },
  daily: { time: ["2026-09-07"], temperature_2m_max: [31.2], temperature_2m_min: [22.8] },
};

describe("weather helpers", () => {
  it("normalizes an Open-Meteo current and daily response", () => {
    expect(parseOpenMeteoWeather(forecast, 1788763200000)).toEqual({
      location: "当前位置",
      current: {
        temperatureC: 27.4,
        weatherCode: 2,
        isDay: true,
        observedAt: "2026-09-07T12:00",
        description: "多云",
      },
      today: { date: "2026-09-07", minC: 22.8, maxC: 31.2 },
      checkedAt: 1788763200000,
    });
  });

  it("maps WMO weather codes to concise Chinese descriptions", () => {
    expect(weatherDescription(0)).toBe("晴");
    expect(weatherDescription(61)).toBe("雨");
    expect(weatherDescription(73)).toBe("雪");
    expect(weatherDescription(95)).toBe("雷雨");
    expect(weatherDescription(7)).toBe("天气");
  });

  it("rejects incomplete or invalid forecast data", () => {
    expect(parseOpenMeteoWeather({ ...forecast, daily: undefined }, 1788763200000)).toBeNull();
    expect(parseOpenMeteoWeather({ ...forecast, current: { ...forecast.current, weather_code: 101 } }, 1788763200000)).toBeNull();
    expect(parseOpenMeteoWeather({ ...forecast, daily: { ...forecast.daily, temperature_2m_min: [] } }, 1788763200000)).toBeNull();
  });

  it("validates the local API wrapper states", () => {
    const snapshot = parseOpenMeteoWeather(forecast, 1788763200000);
    expect(snapshot).not.toBeNull();
    expect(parseWeatherApiState({ status: "ready", checkedAt: 1788763200000, data: snapshot })).toEqual({ status: "ready", checkedAt: 1788763200000, data: snapshot });
    expect(parseWeatherApiState({ status: "unavailable", checkedAt: null, data: null })).toEqual({ status: "unavailable", checkedAt: null, data: null });
    expect(parseWeatherApiState({ status: "ready", checkedAt: null, data: null })).toBeNull();
  });

  it("stores only a coarse location after the user has granted access", () => {
    saveWeatherLocation({ latitude: 31.230412, longitude: 121.473701 }, window.localStorage);

    expect(window.localStorage.getItem(WEATHER_LOCATION_STORAGE_KEY)).toBe('{"latitude":31.23,"longitude":121.47}');
    expect(readStoredWeatherLocation(window.localStorage)).toEqual({ latitude: 31.23, longitude: 121.47 });
  });

  it("accepts numeric or string coordinates from a network-location response", () => {
    expect(parseWeatherCoordinates({ latitude: "31.230412", longitude: 121.473701 })).toEqual({ latitude: 31.23, longitude: 121.47 });
    expect(parseWeatherCoordinates({ latitude: 91, longitude: 121 })).toBeNull();
    expect(parseWeatherCoordinates({ latitude: "not-a-coordinate", longitude: 121 })).toBeNull();
  });

  it("rejects invalid stored coordinates", () => {
    window.localStorage.setItem(WEATHER_LOCATION_STORAGE_KEY, JSON.stringify({ latitude: 95, longitude: 121 }));

    expect(readStoredWeatherLocation(window.localStorage)).toBeNull();
  });

  it("keeps automatic weather refreshes free of browser permission prompts", () => {
    const app = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf8");
    const loadWeather = app.match(/const loadWeather = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[enabled, fetchWeather\]\);/)?.[1];
    const refreshTimer = app.match(/const timer = window\.setInterval\(\(\) => \{([\s\S]*?)\n    \}, 15 \* 60_000\);/)?.[1];

    expect(loadWeather).toBeTruthy();
    expect(refreshTimer).toBeTruthy();
    expect(loadWeather).not.toContain("requestCurrentLocation");
    expect(refreshTimer).not.toContain("requestCurrentLocation");
    expect(app).toContain("return { ...state, retry: requestCurrentLocation }");
  });
});
