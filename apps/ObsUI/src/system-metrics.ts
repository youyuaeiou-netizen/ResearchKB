import { parseDeviceProfile, type DeviceProfile } from "./device-profile";

export type SystemMetricName = "cpu" | "gpu" | "memory" | "disk";
export type SystemTemperatures = Record<SystemMetricName, number | null>;
export type SystemSensorCategory = "cpu" | "gpu" | "memory" | "motherboard" | "storage" | "system";
export type SystemSensorKind = "clock" | "voltage" | "power" | "load" | "temperature";
export type SystemSensorSource = "windows" | "hardware-monitor" | "hwinfo" | "nvidia-smi";

export type SystemSensor = {
  id: string;
  label: string;
  category: SystemSensorCategory;
  kind: SystemSensorKind;
  value: number;
  unit: "MHz" | "V" | "W" | "%" | "°C";
  source: SystemSensorSource;
  sourceLabel: string;
  role: string | null;
};

export type SystemSensorSources = {
  hardwareMonitor: "LibreHardwareMonitor" | "OpenHardwareMonitor" | null;
  hwinfo: boolean;
  nvidia: boolean;
};

export type SystemSensorSelection = {
  summary: string[];
  temperatures: string[];
  summaryDefaultsVersion?: number;
  temperatureDefaultsVersion?: number;
  sensorRecoveryVersion?: number;
};

export type SystemMetrics = Record<SystemMetricName, number> & {
  temperatures: SystemTemperatures;
  sensors: SystemSensor[];
  sources: SystemSensorSources;
  sampledAt: number;
  device?: DeviceProfile | null;
};

export const SYSTEM_SENSOR_SELECTION_STORAGE_KEY = "obsui.system-sensor-card.v5";
export const SYSTEM_SENSOR_RECOMMENDATION_STORAGE_KEY = "obsui.system-sensor-card.recommended.v1";
// Keep the summary configurable without making the card unusably tall; the picker can now hold a useful set of readings beyond the original eight-item cap.
export const SYSTEM_SENSOR_SUMMARY_LIMIT = 16;
export const SYSTEM_SENSOR_TEMPERATURE_LIMIT = 5;
// Version 4 adds the trusted storage-health role to the default summary when a
// monitor exposes a real remaining-life counter.
export const SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION = 4;
// Version 6 also replaces the first LPC temperature with the actual mainboard sensor.
export const SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION = 6;

const metricNames: SystemMetricName[] = ["cpu", "gpu", "memory", "disk"];
const sensorCategories: SystemSensorCategory[] = ["cpu", "gpu", "memory", "motherboard", "storage", "system"];
const sensorKinds: SystemSensorKind[] = ["clock", "voltage", "power", "load", "temperature"];
const sensorSources: SystemSensorSource[] = ["windows", "hardware-monitor", "hwinfo", "nvidia-smi"];
const sensorUnits = new Set<SystemSensor["unit"]>(["MHz", "V", "W", "%", "°C"]);

const asPercent = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : null;
const asTemperature = (value: unknown) => value === null ? null : typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 150 ? Math.round(value * 10) / 10 : undefined;
const asNonEmptyString = (value: unknown, maximum = 180) => typeof value === "string" && value.trim() && value.trim().length <= maximum ? value.trim() : null;
const asSensorNumber = (value: unknown, kind: SystemSensorKind) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const maximum = kind === "temperature" ? 150 : kind === "voltage" ? 20 : kind === "load" ? 100 : kind === "clock" ? 50_000 : 5_000;
  const precision = kind === "voltage" ? 100 : 10;
  return value <= maximum ? Math.round(value * precision) / precision : null;
};

function parseSensor(payload: unknown): SystemSensor | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const id = asNonEmptyString(record.id);
  const label = asNonEmptyString(record.label, 100);
  const category = typeof record.category === "string" && sensorCategories.includes(record.category as SystemSensorCategory) ? record.category as SystemSensorCategory : null;
  const kind = typeof record.kind === "string" && sensorKinds.includes(record.kind as SystemSensorKind) ? record.kind as SystemSensorKind : null;
  const unit = typeof record.unit === "string" && sensorUnits.has(record.unit as SystemSensor["unit"]) ? record.unit as SystemSensor["unit"] : null;
  const source = typeof record.source === "string" && sensorSources.includes(record.source as SystemSensorSource) ? record.source as SystemSensorSource : null;
  const sourceLabel = asNonEmptyString(record.sourceLabel, 80);
  const role = record.role === null || record.role === undefined ? null : asNonEmptyString(record.role, 80);
  if (!id || !label || !category || !kind || !unit || !source || !sourceLabel || role === undefined) return null;
  const expectedUnit = kind === "clock" ? "MHz" : kind === "voltage" ? "V" : kind === "power" ? "W" : kind === "load" ? "%" : "°C";
  const value = asSensorNumber(record.value, kind);
  return value === null || unit !== expectedUnit ? null : { id, label, category, kind, value, unit, source, sourceLabel, role };
}

function parseSources(payload: unknown): SystemSensorSources | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const hardwareMonitor = record.hardwareMonitor === null || record.hardwareMonitor === "LibreHardwareMonitor" || record.hardwareMonitor === "OpenHardwareMonitor" ? record.hardwareMonitor : undefined;
  return hardwareMonitor === undefined || typeof record.hwinfo !== "boolean" || typeof record.nvidia !== "boolean" ? null : { hardwareMonitor, hwinfo: record.hwinfo, nvidia: record.nvidia };
}

export function parseSystemMetrics(payload: unknown): SystemMetrics | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const values = metricNames.map((name) => asPercent(record[name]));
  const temperatureRecord = record.temperatures && typeof record.temperatures === "object" ? record.temperatures as Record<string, unknown> : null;
  const temperatures = temperatureRecord ? metricNames.map((name) => asTemperature(temperatureRecord[name])) : [];
  const sensors = Array.isArray(record.sensors) ? record.sensors.map(parseSensor) : null;
  const sources = parseSources(record.sources);
  const sampledAt = typeof record.sampledAt === "number" && Number.isFinite(record.sampledAt) ? record.sampledAt : null;
  if (values.some((value) => value === null) || temperatures.length !== metricNames.length || temperatures.some((value) => value === undefined) ||
    !sensors || sensors.some((sensor) => sensor === null) || new Set(sensors.map((sensor) => sensor!.id)).size !== sensors.length || !sources || sampledAt === null) return null;

  const device = record.device === undefined ? undefined : record.device === null ? null : parseDeviceProfile(record.device);
  if (record.device !== undefined && record.device !== null && !device) return null;

  return {
    cpu: values[0]!,
    gpu: values[1]!,
    memory: values[2]!,
    disk: values[3]!,
    temperatures: {
      cpu: temperatures[0]!,
      gpu: temperatures[1]!,
      memory: temperatures[2]!,
      disk: temperatures[3]!,
    },
    sensors: sensors as SystemSensor[],
    sources,
    sampledAt,
    ...(device === undefined ? {} : { device }),
  };
}

export function normalizeSystemSensorSelection(payload: unknown): SystemSensorSelection | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const readIds = (value: unknown, limit: number) => Array.isArray(value) && value.every((id) => typeof id === "string" && id.trim() && id.length <= 180)
    ? [...new Set(value.map((id) => id.trim()))].slice(0, limit)
    : null;
  const summary = readIds(record.summary, SYSTEM_SENSOR_SUMMARY_LIMIT);
  const temperatures = readIds(record.temperatures, SYSTEM_SENSOR_TEMPERATURE_LIMIT);
  const summaryDefaultsVersion = typeof record.summaryDefaultsVersion === "number" && Number.isInteger(record.summaryDefaultsVersion) ? record.summaryDefaultsVersion : undefined;
  const temperatureDefaultsVersion = typeof record.temperatureDefaultsVersion === "number" && Number.isInteger(record.temperatureDefaultsVersion) ? record.temperatureDefaultsVersion : undefined;
  const sensorRecoveryVersion = typeof record.sensorRecoveryVersion === "number" && Number.isInteger(record.sensorRecoveryVersion) ? record.sensorRecoveryVersion : undefined;
  return summary && temperatures ? { summary, temperatures, ...(summaryDefaultsVersion === undefined ? {} : { summaryDefaultsVersion }), ...(temperatureDefaultsVersion === undefined ? {} : { temperatureDefaultsVersion }), ...(sensorRecoveryVersion === undefined ? {} : { sensorRecoveryVersion }) } : null;
}

export function defaultSystemSensorSelection(sensors: SystemSensor[]): SystemSensorSelection {
  const byRole = (roles: string[], kind?: SystemSensorKind) => roles.map((role) => sensors.find((sensor) => sensor.role === role && (!kind || sensor.kind === kind))).filter((sensor): sensor is SystemSensor => Boolean(sensor));
  const summaryPreferred = byRole(["cpu-clock", "cpu-voltage", "cpu-load", "cpu-power", "gpu-core-clock", "gpu-memory-clock", "gpu-power", "memory-load", "gpu-load", "disk-load", "storage-health"]);
  const summaryFallback = sensors.filter((sensor) => sensor.kind !== "temperature" && sensor.role !== null && !summaryPreferred.some((preferred) => preferred.id === sensor.id));
  const temperaturePreferred = byRole(["cpu-temperature", "gpu-temperature", "motherboard-temperature", "storage-temperature", "memory-temperature"], "temperature");
  const temperatureFallback = sensors.filter((sensor) => sensor.kind === "temperature" && !temperaturePreferred.some((preferred) => preferred.id === sensor.id));
  return {
    summary: [...summaryPreferred, ...summaryFallback].slice(0, SYSTEM_SENSOR_SUMMARY_LIMIT).map((sensor) => sensor.id),
    temperatures: [...temperaturePreferred, ...temperatureFallback].slice(0, SYSTEM_SENSOR_TEMPERATURE_LIMIT).map((sensor) => sensor.id),
  };
}
