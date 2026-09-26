import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { IoAddOutline, IoBookOutline, IoChatbubbleEllipsesOutline, IoCheckmarkCircleOutline, IoCloudDownloadOutline, IoCloudUploadOutline, IoCloseOutline, IoCubeOutline, IoDesktopOutline, IoDocumentTextOutline, IoGlobeOutline, IoHardwareChipOutline, IoLayersOutline, IoLinkOutline, IoPaperPlaneOutline, IoPlayOutline, IoPowerOutline, IoPulseOutline, IoServerOutline, IoSettingsOutline, IoStopCircleOutline, IoTimerOutline, IoTrashOutline } from "react-icons/io5";
import { useHddChat } from "../HddChatPanel";
import flClashIconUrl from "../../assets/proxy/flclash.png";
import clashVergeIconUrl from "../../assets/proxy/clash-verge.png";
import { codexUsageWindowLabel, sortCodexUsageWindows } from "../codex-usage";
import type { DeviceProfile, DeviceStorage } from "../device-profile";
import { DEFAULT_LOCAL_MODEL } from "../literature";
import { DEFAULT_LOCAL_MODEL_SETTINGS, LOCAL_MODEL_CONTEXT_LENGTHS, LOCAL_MODEL_OUTPUT_LENGTHS, LOCAL_MODEL_THINKING_LEVELS, groupLocalModels, localModelThinkingFor, normalizeLocalModelSettings, parseLocalModelState, withLocalModelThinking, type LocalModelContextLength, type LocalModelOutputLength, type LocalModelSettings, type LocalModelThinking } from "../local-models";
import type { ProjectKind, ResourceKind } from "../types";
import { defaultSystemSensorSelection, normalizeSystemSensorSelection, SYSTEM_SENSOR_RECOMMENDATION_STORAGE_KEY, SYSTEM_SENSOR_SELECTION_STORAGE_KEY, SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION, SYSTEM_SENSOR_SUMMARY_LIMIT, SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION, SYSTEM_SENSOR_TEMPERATURE_LIMIT, type SystemMetrics, type SystemSensor, type SystemSensorCategory, type SystemSensorSelection } from "../system-metrics";
import { ActionButton } from "./ActionButton";
import { CardRail } from "./CardRail";
import { ContentCard } from "./ContentCard";
import type { LocalModelControlAction, ProxyLaunchResult, V2BusinessContext, V2TabKey } from "./model";
import { DEFAULT_DUE_TIME, formatDueDate, formatDueTime } from "../target-v1/task-model";

const formatDuration = (totalSeconds: number) => [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
const formatRate = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount >= 100 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
};
const formatQuotaReset = (resetsAt: number, windowMinutes: number) => new Date(resetsAt).toLocaleString("zh-CN", windowMinutes === 300 ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric" });
const formatDeviceBytes = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "暂不可用";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount >= 100 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
};
const formatDeviceParts = (parts: Array<string | number | null | undefined>) => parts.filter((part): part is string | number => part !== null && part !== undefined && String(part).trim() !== "").join(" · ");
const formatDeviceResolution = (width: number | null, height: number | null, refreshRateHz: number | null) => formatDeviceParts([width !== null && height !== null ? `${width} × ${height}` : null, refreshRateHz !== null ? `${refreshRateHz} Hz` : null]);
const kindLabel: Record<ProjectKind, string> = { course: "课程", research: "科研", personal: "个人" };
const resourceLabel: Record<ResourceKind, string> = { link: "链接", file: "本机路径", note: "备注" };

function EmptyState({ title, detail, icon = <IoCubeOutline aria-hidden="true" />, showDetail = true }: { title: string; detail: string; icon?: ReactNode; showDetail?: boolean }) {
  return <div className="tab-modal-v2__empty"><span>{icon}</span><b>{title}</b>{showDetail && <small>{detail}</small>}</div>;
}

type OverviewStatusTone = "ready" | "warning" | "muted";

type SensorCardSensor = SystemSensor & { available: boolean };
type StoredSensorDescriptor = Omit<SensorCardSensor, "value" | "available">;
type SensorSelectionTarget = "summary" | "temperatures";
const systemSensorCatalogStorageKey = "obsui.system-sensor-card.catalog.v1";
const systemSensorRecoveryVersion = 1;
const legacySystemSensorSelectionStorageKeys = [
  "obsui.system-sensor-card.v3",
  "obsui.system-sensor-card.v4",
];

const expectedSummarySensors: Omit<SensorCardSensor, "value">[] = [
  { id: "unavailable:cpu-voltage", label: "CPU 核心电压", category: "cpu", kind: "voltage", unit: "V", source: "windows", sourceLabel: "未检测到实测核心电压；VID 是请求值", role: "cpu-voltage", available: false },
  { id: "unavailable:cpu-load", label: "CPU 占用", category: "cpu", kind: "load", unit: "%", source: "windows", sourceLabel: "当前未检测到", role: "cpu-load", available: false },
  { id: "unavailable:gpu-load", label: "GPU 占用", category: "gpu", kind: "load", unit: "%", source: "windows", sourceLabel: "当前未检测到", role: "gpu-load", available: false },
  { id: "unavailable:gpu-memory-load", label: "GPU 显存占用", category: "gpu", kind: "load", unit: "%", source: "windows", sourceLabel: "需要 NVIDIA SMI 或 HWiNFO", role: "gpu-memory-load", available: false },
  { id: "unavailable:memory-load", label: "内存占用", category: "memory", kind: "load", unit: "%", source: "windows", sourceLabel: "当前未检测到", role: "memory-load", available: false },
];

const expectedTemperatureSensors: Omit<SensorCardSensor, "value">[] = [
  { id: "unavailable:cpu-temperature", label: "CPU 温度", category: "cpu", kind: "temperature", unit: "°C", source: "windows", sourceLabel: "当前未检测到", role: "cpu-temperature", available: false },
  { id: "unavailable:gpu-temperature", label: "GPU 温度", category: "gpu", kind: "temperature", unit: "°C", source: "windows", sourceLabel: "当前未检测到", role: "gpu-temperature", available: false },
  { id: "unavailable:motherboard-temperature", label: "主板温度", category: "motherboard", kind: "temperature", unit: "°C", source: "windows", sourceLabel: "当前未检测到", role: "motherboard-temperature", available: false },
  { id: "unavailable:storage-temperature", label: "存储温度", category: "storage", kind: "temperature", unit: "°C", source: "windows", sourceLabel: "当前未检测到", role: "storage-temperature", available: false },
  { id: "unavailable:memory-temperature", label: "内存温度", category: "memory", kind: "temperature", unit: "°C", source: "windows", sourceLabel: "当前未检测到", role: "memory-temperature", available: false },
];

const hiddenStorageHealthPattern = /^(?:磁盘可用备用|磁盘备用阈值|磁盘已用寿命|available spare(?: threshold)?|percentage used)$/i;

function isHiddenStorageHealthSensor(sensor: SystemSensor) {
  return sensor.category === "storage" && hiddenStorageHealthPattern.test(sensor.label.trim());
}

function normalizeDiscoveredSensor(sensor: SystemSensor): SystemSensor {
  if (sensor.category === "system" && sensor.kind === "clock" && /^(?:内存频率|memory\s+(?:clock|frequency))$/i.test(sensor.label.trim())) {
    return { ...sensor, category: "memory", role: sensor.role ?? "memory-clock" };
  }
  if (sensor.category === "cpu" && sensor.kind === "temperature" && sensor.role === "cpu-temperature" && /(?:封装|package)/i.test(sensor.label)) {
    return { ...sensor, role: "cpu-package-temperature" };
  }
  return sensor;
}

function storageDeviceId(device: DeviceStorage, index: number) {
  const modelSlug = device.model.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 72);
  return device.deviceId || `storage-model:${modelSlug || index}`;
}

function sensorCardCandidates(sensors: SystemSensor[], storageDevices: DeviceStorage[] = []): SensorCardSensor[] {
  const resolved = sensors.map(normalizeDiscoveredSensor).filter((sensor) => !isHiddenStorageHealthSensor(sensor)).map((sensor) => ({ ...sensor, available: true }));
  const directCpuVid = resolved.find((sensor) => sensor.category === "cpu" && sensor.kind === "voltage" && sensor.source === "hwinfo" && /^(?:core\s*vids|cpu\s*core\s*vid)$/i.test(sensor.label.trim()));
  const cpuVidReadings = resolved.filter((sensor) => sensor.category === "cpu" && sensor.kind === "voltage" && sensor.source === "hwinfo" && /^(?:[pe]-core\s*\d+\s*vid|core\s*#?\s*\d+\s*vid)$/i.test(sensor.label.trim()));
  const cpuVidValue = directCpuVid?.value ?? (cpuVidReadings.length ? Math.max(...cpuVidReadings.map((sensor) => sensor.value)) : null);
  const cpuVidSensor: SensorCardSensor[] = cpuVidValue === null || hasSensorRole(resolved, "cpu-voltage") ? [] : [{
    id: "summary:cpu-vid",
    label: "CPU 请求电压（VID）",
    category: "cpu",
    kind: "voltage",
    unit: "V",
    source: "hwinfo",
    sourceLabel: directCpuVid ? "HWiNFO · Core VIDs" : "HWiNFO · 最高核心 VID",
    role: "cpu-vid",
    value: cpuVidValue,
    available: true,
  }];
  const directCoreTemperature = resolved.find((sensor) => sensor.category === "cpu" && sensor.kind === "temperature" && sensor.source === "hwinfo" && /^(?:core\s*temperatures?|核心温度)$/i.test(sensor.label.trim()));
  const coreTemperatureReadings = resolved.filter((sensor) => sensor.category === "cpu" && sensor.kind === "temperature" && sensor.source === "hwinfo" && /^(?:[pe]-core\s*\d+|core\s*#?\s*\d+|核心\s*#?\s*\d+)$/i.test(sensor.label.trim()));
  const coreTemperatureValue = directCoreTemperature?.value ?? (coreTemperatureReadings.length ? Math.round(coreTemperatureReadings.reduce((sum, sensor) => sum + sensor.value, 0) / coreTemperatureReadings.length) : null);
  const cpuCoreTemperature: SensorCardSensor[] = coreTemperatureValue === null ? [] : [{
    id: "summary:cpu-core-temperature",
    label: "CPU 核心温度",
    category: "cpu",
    kind: "temperature",
    unit: "°C",
    source: "hwinfo",
    sourceLabel: directCoreTemperature ? "HWiNFO · 核心温度" : "HWiNFO · 各核心平均",
    role: "cpu-temperature",
    value: coreTemperatureValue,
    available: true,
  }];
  const candidates = [...resolved, ...cpuVidSensor, ...cpuCoreTemperature];
  const discoveredRoles = new Set(candidates.map((sensor) => sensor.role));
  const storagePlaceholders = storageDevices.flatMap((device, index) => {
    const deviceId = storageDeviceId(device, index);
    const matchesDevice = (sensor: SensorCardSensor) => sensor.deviceId === deviceId || sensor.deviceName?.localeCompare(device.model, undefined, { sensitivity: "accent" }) === 0;
    const placeholder = (role: "disk-load" | "storage-health" | "storage-temperature", label: string, kind: "load" | "temperature", unit: "%" | "°C"): SensorCardSensor | null =>
      candidates.some((sensor) => sensor.role === role && matchesDevice(sensor)) ? null : {
        id: `unavailable:${deviceId}:${role}`,
        label,
        category: "storage",
        kind,
        unit,
        source: "windows",
        sourceLabel: "当前未检测到",
        role,
        deviceId,
        deviceName: device.model,
        value: 0,
        available: false,
      };
    return [
      placeholder("storage-temperature", "硬盘温度", "temperature", "°C"),
      placeholder("disk-load", "硬盘活动", "load", "%"),
      placeholder("storage-health", "磁盘剩余寿命", "load", "%"),
    ].filter((sensor): sensor is SensorCardSensor => sensor !== null);
  });
  const missingSummary = expectedSummarySensors.filter((sensor) => !(sensor.role === "cpu-voltage" && hasSensorRole(candidates, "cpu-vid")) && !discoveredRoles.has(sensor.role));
  const genericStorageSummary = storageDevices.length ? [] : [
    { id: "unavailable:disk-load", label: "硬盘活动", category: "storage" as const, kind: "load" as const, unit: "%" as const, source: "windows" as const, sourceLabel: "当前未检测到", role: "disk-load", available: false, value: 0 },
    { id: "unavailable:storage-health", label: "磁盘剩余寿命", category: "storage" as const, kind: "load" as const, unit: "%" as const, source: "windows" as const, sourceLabel: "当前未检测到", role: "storage-health", available: false, value: 0 },
  ];
  const missingTemperatures = expectedTemperatureSensors
    .filter((sensor) => sensor.role !== "storage-temperature" && !discoveredRoles.has(sensor.role));
  if (!storageDevices.length && !discoveredRoles.has("storage-temperature")) {
    missingTemperatures.push(expectedTemperatureSensors.find((sensor) => sensor.role === "storage-temperature")!);
  }
  return [
    ...candidates,
    ...missingSummary.map((sensor) => ({ ...sensor, value: 0 })),
    ...genericStorageSummary,
    ...storagePlaceholders,
    ...missingTemperatures.map((sensor) => ({ ...sensor, value: 0 })),
  ];
}

function defaultCardSensorSelection(sensors: SensorCardSensor[]): SystemSensorSelection {
  return { ...defaultSystemSensorSelection(sensors), summaryDefaultsVersion: SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION, temperatureDefaultsVersion: SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION };
}

function sensorSelectionRoleKey(sensor: SystemSensor) {
  return sensor.category === "storage" && ["disk-load", "storage-health", "storage-temperature"].includes(sensor.role ?? "")
    ? `${sensor.role}:${sensor.deviceId ?? sensor.id}`
    : sensor.role ?? sensor.id;
}

function mergeSensorDefaults(selection: SystemSensorSelection, defaults: SystemSensorSelection, sensors: SensorCardSensor[], target: SensorSelectionTarget) {
  const requiredSummaryRoles = new Set(["cpu-voltage", "cpu-vid", "cpu-load", "gpu-load", "gpu-memory-load", "memory-load"]);
  const requiredTemperatureRoles = new Set(["cpu-temperature", "gpu-temperature", "memory-temperature", "motherboard-temperature", "storage-temperature"]);
  const required = (sensor: SensorCardSensor | undefined) => {
    if (!sensor) return false;
    if (target === "summary") return requiredSummaryRoles.has(sensor.role ?? "") || sensor.category === "storage" && sensor.role === "storage-health";
    return sensor.kind === "temperature" && requiredTemperatureRoles.has(sensor.role ?? "");
  };
  const byId = new Map(sensors.map((sensor) => [sensor.id, sensor]));
  const requiredIds = defaults[target].filter((id) => required(byId.get(id)));
  const requiredKeys = new Set(requiredIds.map((id) => sensorSelectionRoleKey(byId.get(id)!)));
  const preserved = selection[target].filter((id) => {
    const sensor = byId.get(id);
    if (target === "summary" && sensor?.role === "cpu-voltage" && sensors.some((candidate) => candidate.available && candidate.role === "cpu-vid")) return false;
    if (target === "summary" && (sensor?.role === "disk-load" || id.endsWith(":disk-load") || id === "windows:disk-load")) return false;
    if (target === "temperatures" && sensor?.category === "cpu" && sensor.kind === "temperature" && sensor.role !== "cpu-temperature") return false;
    return !sensor || !requiredKeys.has(sensorSelectionRoleKey(sensor));
  });
  const optionalDefaults = defaults[target].filter((id) => !required(byId.get(id)));
  const limit = target === "summary" ? SYSTEM_SENSOR_SUMMARY_LIMIT : SYSTEM_SENSOR_TEMPERATURE_LIMIT;
  return [...new Set([...requiredIds, ...preserved, ...optionalDefaults])].slice(0, limit);
}

const cpuDetailLabelPattern = /(?:core\s*#?\s*\d|核心\s*#?\s*\d|t\d+|thread\s*\d|vid|smu|ccd\s*\d)/i;
const cpuSummaryRoles = new Set(["cpu-clock", "cpu-voltage", "cpu-vid", "cpu-power", "cpu-load", "cpu-temperature"]);
const gpuSummaryRoles = new Set(["gpu-core-clock", "gpu-memory-clock", "gpu-power", "gpu-load", "gpu-memory-load", "gpu-temperature"]);
const cpuBusClockPattern = /^(?:cpu\s*)?(?:总线频率|bus\s+speed|cpu\s+bus\s+speed)$/i;
const cpuPeakLoadPattern = /^(?:最大cpu\/线程使用率|maximum\s+cpu\/thread\s+usage)$/i;
const cpuCoreMaxLoadPattern = /^(?:cpu\s*)?核心最高占用$/i;
const gpuRawVoltagePattern = /(?:12vhpwr|fbvdd|misc\d*|pcie\s*\+?12v|(?:^|\s)(?:gpu\s*)?soc(?:\s|$)|^gpu电压$)/i;

function hasSensorRole(sensors: SensorCardSensor[], role: string) {
  return sensors.some((sensor) => sensor.available && sensor.role === role);
}

function isCpuPickerSensor(sensor: SensorCardSensor, sensors: SensorCardSensor[]) {
  if (sensor.category !== "cpu") return false;
  if (!sensor.available) return sensor.role !== null && cpuSummaryRoles.has(sensor.role) && !(sensor.role === "cpu-voltage" && hasSensorRole(sensors, "cpu-vid"));
  if (sensor.role && cpuSummaryRoles.has(sensor.role)) return true;
  if (cpuDetailLabelPattern.test(sensor.label)) return false;
  const label = sensor.label.trim();
  if (sensor.kind === "clock") {
    if (cpuBusClockPattern.test(label)) return false;
    // Prefer the HWiNFO aggregate clock when it exists; lower-priority LHM
    // aggregate/fallback clock entries are the same choice in practice.
    if (sensor.source === "hardware-monitor" && hasSensorRole(sensors, "cpu-clock")) return false;
    return /平均有效频率|有效频率|cpu\s*(?:频率|clock|effective)|average\s+effective/i.test(label);
  }
  if (sensor.kind === "voltage") {
    return !hasSensorRole(sensors, "cpu-voltage") && /vcore|cpu.*(?:电压|voltage)|(?:电压|voltage).*cpu/i.test(label);
  }
  if (sensor.kind === "power") {
    return !hasSensorRole(sensors, "cpu-power") && /package|封装|cpu.*(?:功耗|power)|(?:功耗|power).*cpu/i.test(label);
  }
  if (sensor.kind === "load") {
    if (cpuPeakLoadPattern.test(label)) return true;
    if (cpuCoreMaxLoadPattern.test(label)) return !sensors.some((candidate) => candidate.available && candidate.source === "hwinfo" && cpuPeakLoadPattern.test(candidate.label));
    if (hasSensorRole(sensors, "cpu-load")) return false;
    return /(?:cpu|total).*?(?:占用|使用率|load|usage)|(?:总|全部).*?(?:占用|使用率)/i.test(label);
  }
  return sensor.kind === "temperature" && sensor.role === "cpu-temperature";
}

function isGpuPickerSensor(sensor: SensorCardSensor, sensors: SensorCardSensor[]) {
  if (sensor.category !== "gpu") return false;
  if (!sensor.available) return sensor.role !== null && gpuSummaryRoles.has(sensor.role);
  if (sensor.role && gpuSummaryRoles.has(sensor.role)) return true;
  if (sensor.kind !== "voltage") return sensor.kind === "temperature";
  const label = sensor.label.trim();
  if (gpuRawVoltagePattern.test(label)) return false;
  // LHM's English GPU Core Voltage duplicates HWiNFO's canonical reading;
  // keep the higher-priority HWiNFO entry while retaining distinct VDDCR_GFX.
  if (sensor.source === "hardware-monitor" && /^gpu\s+core\s+voltage$/i.test(label) && sensors.some((candidate) => candidate.available && candidate.source === "hwinfo" && /^gpu\s+核心电压$/i.test(candidate.label.trim()))) return false;
  return /^(?:gpu\s+核心电压(?:\s*\(.*\))?|gpu\s+core\s+voltage)$/i.test(label);
}

function isMemoryPickerSensor(sensor: SensorCardSensor) {
  return sensor.category === "memory" && sensor.role !== null && ["memory-clock", "memory-load", "memory-temperature"].includes(sensor.role);
}

function isMotherboardPickerSensor(sensor: SensorCardSensor, sensors: SensorCardSensor[]) {
  if (sensor.category !== "motherboard") return false;
  if (!sensor.available) return sensor.role === "motherboard-temperature";
  if (sensor.role === "motherboard-temperature") return true;
  if (sensor.kind !== "voltage") return false;
  const label = sensor.label.trim();
  if (/^(?:vcore|vdd_misc|mem\s+vddio|主板电压\s*#\s*\d+)$/i.test(label)) return false;
  if (sensor.source === "hardware-monitor" && /^\+?3v\s*standby$/i.test(label) && sensors.some((candidate) => candidate.available && candidate.source === "hwinfo" && /^3vsb$/i.test(candidate.label.trim()))) return false;
  if (sensor.source === "hardware-monitor" && /^cmos\s+battery$/i.test(label) && sensors.some((candidate) => candidate.available && candidate.source === "hwinfo" && /^vbat$/i.test(candidate.label.trim()))) return false;
  return /^(?:\+?12v|\+?5v|3vsb|\+?3v\s*standby|avcc3|vbat)$/i.test(label);
}

function isStoragePickerSensor(sensor: SensorCardSensor) {
  return sensor.category === "storage" && sensor.role !== null && ["disk-load", "storage-health", "storage-temperature"].includes(sensor.role);
}

function isSummaryPickerSensor(sensor: SensorCardSensor, sensors: SensorCardSensor[]) {
  if (sensor.category === "cpu") return isCpuPickerSensor(sensor, sensors);
  if (sensor.category === "gpu") return isGpuPickerSensor(sensor, sensors);
  if (sensor.category === "memory") return isMemoryPickerSensor(sensor);
  if (sensor.category === "motherboard") return isMotherboardPickerSensor(sensor, sensors);
  if (sensor.category === "storage") return isStoragePickerSensor(sensor);
  return sensor.available && sensor.kind !== "temperature";
}

const sensorPickerRoleOrder: Record<string, number> = {
  "cpu-clock": 10,
  "cpu-voltage": 20,
  "cpu-vid": 20,
  "cpu-load": 30,
  "cpu-power": 40,
  "gpu-core-clock": 10,
  "gpu-memory-clock": 20,
  "gpu-power": 30,
  "gpu-load": 40,
  "gpu-memory-load": 50,
  "memory-clock": 10,
  "memory-load": 20,
  "memory-temperature": 0,
  "storage-health": 20,
  "disk-load": 30,
  "storage-temperature": 0,
};
const sensorPickerKindOrder: Record<SystemSensor["kind"], number> = { clock: 10, voltage: 20, load: 30, power: 40, temperature: 0 };

function sortPickerSensors(sensors: SensorCardSensor[]) {
  return [...sensors].sort((left, right) => (sensorPickerRoleOrder[left.role ?? ""] ?? sensorPickerKindOrder[left.kind]) - (sensorPickerRoleOrder[right.role ?? ""] ?? sensorPickerKindOrder[right.kind]) || (left.deviceName ?? "").localeCompare(right.deviceName ?? "", "zh-CN") || left.label.localeCompare(right.label, "zh-CN"));
}

function removeNonCanonicalSummarySelections(selection: SystemSensorSelection, sensors: SensorCardSensor[], knownSensors: Map<string, SensorCardSensor>): SystemSensorSelection {
  const allSensors = [...new Map([...knownSensors.entries(), ...sensors.map((sensor) => [sensor.id, sensor] as const)]).values()];
  const byId = new Map(allSensors.map((sensor) => [sensor.id, sensor]));
  const summary = selection.summary.filter((id) => {
    const sensor = byId.get(id);
    return !sensor || !sensor.available || isSummaryPickerSensor(sensor, allSensors);
  });
  return summary.length === selection.summary.length ? selection : { ...selection, summary };
}

function restoreDetectedTemperatureSensors(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  const detectedByRole = new Map(sensors.filter((sensor) => sensor.available && sensor.kind === "temperature" && sensor.role).map((sensor) => [sensorSelectionRoleKey(sensor), sensor.id]));
  const temperatures = selection.temperatures.map((id) => {
    const unavailable = sensors.find((sensor) => sensor.id === id);
    const role = unavailable?.role ?? (id.startsWith("unavailable:") ? id.slice("unavailable:".length) : null);
    if (!role) return id;
    const key = unavailable?.deviceId ? `${role}:${unavailable.deviceId}` : role;
    return detectedByRole.get(key) ?? id;
  });
  return temperatures.every((id, index) => id === selection.temperatures[index]) ? selection : { ...selection, temperatures };
}

function removeMissingGpuTemperature(selection: SystemSensorSelection, sensors: SensorCardSensor[], knownSensors: Map<string, SensorCardSensor>): SystemSensorSelection {
  const liveGpuTemperature = sensors.find((sensor) => sensor.available && sensor.role === "gpu-temperature");
  const temperatures = [...new Set(selection.temperatures.flatMap((id) => {
    const historical = knownSensors.get(id);
    if (historical?.role !== "gpu-temperature" || sensors.some((sensor) => sensor.id === id && sensor.available)) return [id];
    return liveGpuTemperature ? [liveGpuTemperature.id] : [];
  }))];
  return temperatures.length === selection.temperatures.length && temperatures.every((id, index) => id === selection.temperatures[index]) ? selection : { ...selection, temperatures };
}

function keepOneCpuTemperature(selection: SystemSensorSelection, sensors: SensorCardSensor[], knownSensors: Map<string, SensorCardSensor>): SystemSensorSelection {
  const canonical = sensors.find((sensor) => sensor.available && sensor.category === "cpu" && sensor.role === "cpu-temperature");
  const byId = new Map([...knownSensors.entries(), ...sensors.map((sensor) => [sensor.id, sensor] as const)]);
  let keptCpu = false;
  const temperatures = selection.temperatures.flatMap((id) => {
    const sensor = byId.get(id);
    if (sensor?.category !== "cpu" || sensor.kind !== "temperature") return [id];
    if (keptCpu) return [];
    keptCpu = true;
    return [canonical?.id ?? id];
  });
  return temperatures.length === selection.temperatures.length && temperatures.every((id, index) => id === selection.temperatures[index]) ? selection : { ...selection, temperatures };
}

function refreshSensorSelection(selection: SystemSensorSelection, sensors: SensorCardSensor[], knownSensors: Map<string, SensorCardSensor>): SystemSensorSelection {
  let next = restoreDetectedTemperatureSensors(selection, sensors);
  next = restoreDetectedSummarySensors(next, sensors);
  next = replaceUnverifiedCpuBoardVoltage(next, sensors);
  next = replaceLegacyCpuCoreVid(next, sensors);
  next = replaceUnavailableCpuVoltageWithVid(next, sensors);
  next = recoverHWiNFOSensorSelection(next, sensors);
  next = removeNonCanonicalSummarySelections(next, sensors, knownSensors);
  next = removeMissingGpuTemperature(next, sensors, knownSensors);
  return keepOneCpuTemperature(next, sensors, knownSensors);
}

function restoreDetectedSummarySensors(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  const detectedByRole = new Map(sensors.filter((sensor) => sensor.available && sensor.role).map((sensor) => [sensorSelectionRoleKey(sensor), sensor.id]));
  const summary = selection.summary.map((id) => {
    const unavailable = sensors.find((sensor) => sensor.id === id);
    const role = unavailable?.role ?? (id.startsWith("unavailable:") ? id.slice("unavailable:".length) : null);
    if (!role) return id;
    const key = unavailable?.deviceId ? `${role}:${unavailable.deviceId}` : role;
    return detectedByRole.get(key) ?? id;
  });
  return summary.every((id, index) => id === selection.summary[index]) ? selection : { ...selection, summary };
}

function replaceLegacyCpuCoreVid(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  const cpuVid = sensors.find((sensor) => sensor.available && sensor.category === "cpu" && sensor.kind === "voltage" && sensor.role === "cpu-vid");
  if (!cpuVid) return selection;
  const summary = [...new Set(selection.summary.map((id) => {
    const selected = sensors.find((sensor) => sensor.id === id);
    return selected?.category === "cpu" && selected.kind === "voltage" && /(?:单核\s*VID|Core\s*#.*\sVID|[PE]-core\s*\d+\s*VID)/i.test(selected.label) ? cpuVid.id : id;
  }))];
  return summary.length === selection.summary.length && summary.every((id, index) => id === selection.summary[index]) ? selection : { ...selection, summary };
}

function replaceUnavailableCpuVoltageWithVid(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  const cpuVid = sensors.find((sensor) => sensor.available && sensor.category === "cpu" && sensor.role === "cpu-vid");
  if (!cpuVid || !selection.summary.includes("unavailable:cpu-voltage")) return selection;
  return { ...selection, summary: [...new Set(selection.summary.map((id) => id === "unavailable:cpu-voltage" ? cpuVid.id : id))] };
}

function replaceUnverifiedCpuBoardVoltage(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  const trustedVoltage = sensors.find((sensor) => sensor.available && sensor.category === "cpu" && sensor.kind === "voltage" && sensor.role === "cpu-voltage");
  const summary = [...new Set(selection.summary.map((id) => id === "hardware-monitor:web:/lpc/it8613e/0/voltage/0" ? trustedVoltage?.id ?? "unavailable:cpu-voltage" : id))];
  return summary.length === selection.summary.length && summary.every((id, index) => id === selection.summary[index]) ? selection : { ...selection, summary };
}

function recoverHWiNFOSensorSelection(selection: SystemSensorSelection, sensors: SensorCardSensor[]): SystemSensorSelection {
  if (selection.sensorRecoveryVersion === systemSensorRecoveryVersion) return selection;
  if (!sensors.some((sensor) => sensor.available && sensor.source === "hwinfo")) return selection;
  const byRole = new Map<string, SensorCardSensor>();
  sensors.filter((sensor) => sensor.available && sensor.role).forEach((sensor) => {
    const roleKey = sensorSelectionRoleKey(sensor);
    const current = byRole.get(roleKey);
    if (!current || (current.source !== "hwinfo" && sensor.source === "hwinfo")) byRole.set(roleKey, sensor);
  });
  const byId = new Map(sensors.map((sensor) => [sensor.id, sensor]));
  const summary = selection.summary.map((id) => {
    const selected = byId.get(id);
    const preferred = selected?.role ? byRole.get(sensorSelectionRoleKey(selected)) : undefined;
    return preferred && selected?.source !== "hwinfo" && preferred.source === "hwinfo" ? preferred.id : id;
  });
  const trustedVoltage = byRole.get("cpu-voltage");
  if (trustedVoltage && !summary.some((id) => byId.get(id)?.role === "cpu-voltage")) {
    const firstCpuIndex = summary.findIndex((id) => byId.get(id)?.category === "cpu");
    const insertAt = firstCpuIndex >= 0 ? firstCpuIndex : Math.min(3, summary.length);
    summary.splice(insertAt, 0, trustedVoltage.id);
  }
  return { ...selection, summary: [...new Set(summary)].slice(0, SYSTEM_SENSOR_SUMMARY_LIMIT), sensorRecoveryVersion: systemSensorRecoveryVersion };
}

function TemperatureRow({ sensor }: { sensor: SensorCardSensor }) {
  const tone = !sensor.available ? "unavailable" : sensor.value >= 80 ? "hot" : sensor.value >= 65 ? "warm" : "normal";
  return <div className={`tab-modal-v2__temperature-row tab-modal-v2__temperature-row--${tone}`}>
    <span title={sensor.label}>{sensorDisplayLabel(sensor)}</span>
    <strong>{formatSensorValue(sensor)}</strong>
    <div className="tab-modal-v2__temperature-track"><div className="tab-modal-v2__temperature-meter"><i style={{ width: sensor.available ? `${Math.min(100, Math.max(0, sensor.value))}%` : "0%" }} /></div></div>
  </div>;
}

const sensorCategoryLabels: Record<SystemSensorCategory, string> = { cpu: "CPU", gpu: "GPU", memory: "内存", motherboard: "主板", storage: "存储", system: "系统" };
const sensorCategories: SystemSensorCategory[] = ["cpu", "gpu", "memory", "motherboard", "storage", "system"];
const sensorKindLabels: Record<SystemSensor["kind"], string> = { clock: "频率", voltage: "电压", power: "功耗", load: "占用", temperature: "温度" };
const sensorSemanticLabel = (sensor: SensorCardSensor) => sensor.role === "storage-health" ? "寿命" : sensorKindLabels[sensor.kind];
function sensorDisplayLabel(sensor: SensorCardSensor) {
  const byRole: Record<string, string> = {
    "cpu-load": "CPU 占用",
    "cpu-vid": "CPU 请求电压（VID）",
    "cpu-package-temperature": "CPU 封装温度",
    "gpu-temperature": "显卡温度",
    "gpu-load": "显卡占用",
    "gpu-memory-load": "显存占用",
    "memory-temperature": "内存温度",
    "motherboard-temperature": "主板温度",
    "storage-temperature": "硬盘温度",
    "storage-health": "硬盘剩余寿命",
    "disk-load": "硬盘活动率",
  };
  const label = sensor.role === "cpu-temperature" && sensor.label === "CPU 封装"
    ? "CPU 温度（封装）"
    : sensor.role && byRole[sensor.role]
      ? byRole[sensor.role]
    : sensor.label
      .replace(/^P-core (\d+)/, "性能核心 $1")
      .replace(/^E-core (\d+)/, "能效核心 $1")
      .replace(/^Ring\/LLC /, "缓存环总线 ")
      .replace(/^SA VID$/, "系统代理请求电压")
      .replace(/^iGPU VID$/, "核显请求电压")
      .replace(/ VID$/, "请求电压")
      .replace(/与 TjMAX 的差值/, "距温度上限")
      .replace(/^GPU(?: \d+)? /, "显卡 ")
      .replace(/^PCH /, "主板芯片组 ")
      .replace(/^SPD Hub /, "内存模组 ")
      .replace(/^IA 核心功率$/, "CPU 核心功率")
      .replace(/^GT 核心功率$/, "核显功率")
      .replace(/^System Agent 功率$/, "系统代理功率");
  return sensor.deviceName ? `${sensor.deviceName} · ${label}` : label;
}

function formatSensorValue(sensor: SensorCardSensor) {
  if (!sensor.available) return "暂不可用";
  const precision = sensor.unit === "V" ? 2 : sensor.unit === "W" && sensor.value < 100 ? 1 : 0;
  return `${sensor.value.toFixed(precision)} ${sensor.unit}`;
}

function readSystemSensorSelection(): SystemSensorSelection | null {
  try {
    legacySystemSensorSelectionStorageKeys.forEach((key) => window.localStorage.removeItem(key));
    const stored = window.localStorage.getItem(SYSTEM_SENSOR_SELECTION_STORAGE_KEY);
    return stored ? normalizeSystemSensorSelection(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function readSystemSensorRecommendation(): SystemSensorSelection | null {
  try {
    const stored = window.localStorage.getItem(SYSTEM_SENSOR_RECOMMENDATION_STORAGE_KEY);
    return stored ? normalizeSystemSensorSelection(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function readSystemSensorCatalog() {
  const catalog = new Map<string, SensorCardSensor>();
  try {
    const stored = window.localStorage.getItem(systemSensorCatalogStorageKey);
    const values = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(values)) return catalog;
    for (const value of values as Partial<StoredSensorDescriptor>[]) {
      if (!value || typeof value.id !== "string" || !value.id || typeof value.label !== "string" || !value.label || !value.category || !value.kind || !value.unit || !value.source || typeof value.sourceLabel !== "string" || !(value.role === null || typeof value.role === "string")) continue;
      catalog.set(value.id, { ...value as StoredSensorDescriptor, value: 0, available: false });
    }
  } catch { /* Browser storage is optional. */ }
  return catalog;
}

function writeSystemSensorCatalog(sensors: Map<string, SensorCardSensor>) {
  try {
    const catalog: StoredSensorDescriptor[] = [...sensors.values()]
      .filter((sensor) => !sensor.id.startsWith("unavailable:"))
      .map(({ value: _value, available: _available, ...sensor }) => sensor);
    window.localStorage.setItem(systemSensorCatalogStorageKey, JSON.stringify(catalog));
  } catch { /* Browser storage is optional. */ }
}

function SensorReadout({ sensor }: { sensor: SensorCardSensor }) {
  return <div className={`tab-modal-v2__sensor-readout tab-modal-v2__sensor-readout--${sensor.available ? sensor.category : "unavailable"}`}>
    <span title={sensor.label}>{sensorDisplayLabel(sensor)}</span><strong>{formatSensorValue(sensor)}</strong>
  </div>;
}

function UnavailableSensorReadout({ label }: { label: string }) {
  return <div className="tab-modal-v2__sensor-readout tab-modal-v2__sensor-readout--unavailable">
    <span>{label}</span><strong>暂不可用</strong>
  </div>;
}

function UnavailableTemperatureRow({ label }: { label: string }) {
  return <div className="tab-modal-v2__temperature-row tab-modal-v2__temperature-row--unavailable">
    <span>{label}</span>
    <strong>暂不可用</strong>
    <div className="tab-modal-v2__temperature-track"><div className="tab-modal-v2__temperature-meter"><i /></div></div>
  </div>;
}

function SystemSensorCard({ metrics }: { metrics: SystemMetrics | null }) {
  const rawSensors = metrics?.sensors;
  const sensors = sensorCardCandidates(rawSensors ?? [], metrics?.device?.storage ?? []);
  const [selection, setSelection] = useState<SystemSensorSelection | null>(readSystemSensorSelection);
  const [recommendation, setRecommendation] = useState<SystemSensorSelection | null>(readSystemSensorRecommendation);
  const [recommendationNotice, setRecommendationNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"picker" | "details" | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [knownSensors, setKnownSensors] = useState(() => {
    const catalog = readSystemSensorCatalog();
    sensors.filter((sensor) => sensor.available).forEach((sensor) => catalog.set(sensor.id, sensor));
    return catalog;
  });
  const sensorById = new Map([...knownSensors.values()].map((sensor) => [sensor.id, { ...sensor, value: 0, available: false }]));
  sensors.forEach((sensor) => sensorById.set(sensor.id, sensor));
  const activeSelection = keepOneCpuTemperature(removeMissingGpuTemperature(selection ?? defaultCardSensorSelection(sensors), sensors, knownSensors), sensors, knownSensors);
  const activeSelectionForUi: SystemSensorSelection = {
    ...activeSelection,
    summary: activeSelection.summary.filter((id) => sensorById.has(id)),
    temperatures: activeSelection.temperatures.filter((id) => sensorById.has(id)),
  };
  const summarySensors = activeSelectionForUi.summary.map((id) => ({ id, sensor: sensorById.get(id) })).filter((item) => item.sensor);
  const temperatureSensors = activeSelectionForUi.temperatures.map((id) => ({ id, sensor: sensorById.get(id) })).filter((item) => item.sensor);

  useEffect(() => {
    if (!sensors.length) return;
    setKnownSensors((current) => {
      const next = new Map(current);
      sensors.filter((sensor) => sensor.available).forEach((sensor) => next.set(sensor.id, sensor));
      writeSystemSensorCatalog(next);
      return next;
    });
  }, [rawSensors]);

  useEffect(() => {
    if (!rawSensors?.length) return;
    const candidates = sensorCardCandidates(rawSensors, metrics?.device?.storage ?? []);
    const defaults = defaultCardSensorSelection(candidates);
    if (selection === null) {
      setSelection(defaults);
    } else if (selection.summaryDefaultsVersion !== SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION || selection.temperatureDefaultsVersion !== SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION) {
      setSelection({
        ...selection,
        ...(selection.summaryDefaultsVersion !== SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION ? { summary: mergeSensorDefaults(selection, defaults, candidates, "summary"), summaryDefaultsVersion: SYSTEM_SENSOR_SUMMARY_DEFAULTS_VERSION } : {}),
        ...(selection.temperatureDefaultsVersion !== SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION ? { temperatures: mergeSensorDefaults(selection, defaults, candidates, "temperatures"), temperatureDefaultsVersion: SYSTEM_SENSOR_TEMPERATURE_DEFAULTS_VERSION } : {}),
      });
    } else {
      const nextSelection = refreshSensorSelection(selection, candidates, knownSensors);
      if (nextSelection !== selection) {
        setSelection(nextSelection);
        return;
      }
      if (recommendation === null) {
        setRecommendation(nextSelection);
      } else {
        const nextRecommendation = refreshSensorSelection(recommendation, candidates, knownSensors);
        if (nextRecommendation !== recommendation) setRecommendation(nextRecommendation);
      }
    }
  }, [knownSensors, recommendation, selection, rawSensors, metrics?.device?.storage]);

  useEffect(() => {
    if (selection === null) return;
    try { window.localStorage.setItem(SYSTEM_SENSOR_SELECTION_STORAGE_KEY, JSON.stringify(selection)); } catch { /* Browser storage is optional. */ }
  }, [selection]);

  useEffect(() => {
    if (recommendation === null) return;
    try { window.localStorage.setItem(SYSTEM_SENSOR_RECOMMENDATION_STORAGE_KEY, JSON.stringify(recommendation)); } catch { /* Browser storage is optional. */ }
  }, [recommendation]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDialog(null);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dialog]);

  const closeDialog = () => {
    setDialog(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const openDialog = (next: "picker" | "details", trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    if (next === "picker") setRecommendationNotice(null);
    setDialog(next);
  };
  const toggleSensor = (sensor: SensorCardSensor, target: SensorSelectionTarget) => {
    setSelection((current) => {
      const base = current ?? defaultCardSensorSelection(sensors);
      const ids = base[target].filter((id) => sensorById.has(id));
      if (ids.includes(sensor.id)) return { ...base, [target]: ids.filter((id) => id !== sensor.id) };
      const limit = target === "summary" ? SYSTEM_SENSOR_SUMMARY_LIMIT : SYSTEM_SENSOR_TEMPERATURE_LIMIT;
      return ids.length >= limit ? base : { ...base, [target]: [...ids, sensor.id] };
    });
  };

  return <>
    <ContentCard accent="blue" className="tab-modal-v2__overview-card tab-modal-v2__system-overview-card" data-overview-card="system" aria-label="系统状态">
      <div className="tab-modal-v2__card-top">
        <span className="tab-modal-v2__card-icon"><IoPulseOutline aria-hidden="true" /></span>
        <div className="tab-modal-v2__sensor-card-actions">
          <button type="button" aria-controls="obsui-sensor-picker" aria-expanded={dialog === "picker"} onClick={(event) => openDialog("picker", event.currentTarget)}><IoSettingsOutline aria-hidden="true" />选择传感器</button>
          <button type="button" aria-controls="obsui-sensor-details" aria-expanded={dialog === "details"} onClick={(event) => openDialog("details", event.currentTarget)}><IoPulseOutline aria-hidden="true" />传感器详情</button>
        </div>
      </div>
      <div className="tab-modal-v2__overview-card-heading"><b>系统状态</b><span>{metrics ? "3 秒刷新" : "读取中"}</span></div>
      {summarySensors.length ? <div className="tab-modal-v2__sensor-readout-list" aria-label="已选系统读数">{summarySensors.map((item) => <SensorReadout sensor={item.sensor!} key={item.id} />)}</div> : <div className="tab-modal-v2__sensor-empty">{metrics ? "尚未选择摘要传感器" : "正在读取本机性能计数器…"}</div>}
      {temperatureSensors.length > 0 && <div className="tab-modal-v2__temperature-list" aria-label="硬件温度">{temperatureSensors.map((item) => <TemperatureRow sensor={item.sensor!} key={item.id} />)}</div>}
    </ContentCard>
    {dialog && <SystemSensorDialog mode={dialog} sensors={sensors} sources={metrics?.sources} selection={activeSelection} recommendationNotice={recommendationNotice} onClose={closeDialog} onToggle={toggleSensor} onSaveRecommendation={() => { setRecommendation(activeSelection); setRecommendationNotice(`已保存推荐设置：摘要 ${activeSelection.summary.length} 项，温度 ${activeSelection.temperatures.length} 项`); }} onRestore={() => { setSelection(recommendation ?? defaultCardSensorSelection(sensors)); setRecommendationNotice(recommendation ? "已恢复推荐设置" : "当前没有已保存的推荐设置"); }} />}
  </>;
}

function SystemSensorDialog({ mode, sensors, sources, selection, recommendationNotice, onClose, onToggle, onSaveRecommendation, onRestore }: { mode: "picker" | "details"; sensors: SensorCardSensor[]; sources: SystemMetrics["sources"] | undefined; selection: SystemSensorSelection; recommendationNotice: string | null; onClose: () => void; onToggle: (sensor: SensorCardSensor, target: SensorSelectionTarget) => void; onSaveRecommendation: () => void; onRestore: () => void }) {
  const title = mode === "picker" ? "选择传感器" : "传感器详情";
  const detailSensorsByCategory = sensorCategories.map((category) => ({ category, sensors: sensors.filter((sensor) => sensor.category === category) })).filter((group) => group.sensors.length);
  const pickerSensors = sensors.filter((sensor) => isSummaryPickerSensor(sensor, sensors));
  const pickerSensorsByCategory = sensorCategories.map((category) => ({ category, sensors: sortPickerSensors(pickerSensors.filter((sensor) => sensor.category === category)) })).filter((group) => group.sensors.length);
  const renderChoice = (sensor: SensorCardSensor, target: SensorSelectionTarget) => {
    const selected = selection[target].includes(sensor.id);
    const limit = target === "summary" ? SYSTEM_SENSOR_SUMMARY_LIMIT : SYSTEM_SENSOR_TEMPERATURE_LIMIT;
    return <label className={`tab-modal-v2__sensor-choice${sensor.available ? "" : " is-unavailable"}`} key={`${target}:${sensor.id}`}><input type="checkbox" checked={selected} disabled={!selected && selection[target].length >= limit} onChange={() => onToggle(sensor, target)} /><span><b>{sensorDisplayLabel(sensor)}</b><small>{formatSensorValue(sensor)} · {sensor.sourceLabel}</small></span></label>;
  };
  const selectedCount = (groupSensors: SensorCardSensor[], target: SensorSelectionTarget) => groupSensors.filter((sensor) => selection[target].includes(sensor.id)).length;
  const renderPickerGroup = (group: { category: SystemSensorCategory; sensors: SensorCardSensor[] }) => {
    const summarySensors = group.sensors.filter((sensor) => sensor.kind !== "temperature");
    const temperatureSensors = group.sensors.filter((sensor) => sensor.kind === "temperature");
    return <section className="tab-modal-v2__sensor-group" key={group.category}>
      <header><h3>{sensorCategoryLabels[group.category]}</h3>{summarySensors.length > 0 && <span>摘要 {selectedCount(summarySensors, "summary")}/{summarySensors.length}</span>}</header>
      {temperatureSensors.length > 0 && <section className="tab-modal-v2__sensor-temperature-choices"><header><span><IoPulseOutline aria-hidden="true" /><b>温度监控</b></span><small>已选 {selectedCount(temperatureSensors, "temperatures")}/{temperatureSensors.length}</small></header><div className="tab-modal-v2__sensor-choice-grid">{temperatureSensors.map((sensor) => renderChoice(sensor, "temperatures"))}</div></section>}
      {summarySensors.length > 0 && <div className="tab-modal-v2__sensor-choice-grid">{summarySensors.map((sensor) => renderChoice(sensor, "summary"))}</div>}
    </section>;
  };
  return <div className="tab-modal-v2__sensor-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section id={mode === "picker" ? "obsui-sensor-picker" : "obsui-sensor-details"} className="tab-modal-v2__sensor-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span className="tab-modal-v2__sensor-dialog-icon"><IoPulseOutline aria-hidden="true" /></span><div><h2>{title}</h2><p>{mode === "picker" ? `摘要最多 ${SYSTEM_SENSOR_SUMMARY_LIMIT} 项，温度最多 ${SYSTEM_SENSOR_TEMPERATURE_LIMIT} 项；选择器按汇总口径过滤，完整原始读数请看传感器详情。` : "仅显示当前本机可读取的实时数据。"}</p></div></div><button type="button" autoFocus onClick={onClose} aria-label={`关闭${title}`} title={`关闭${title}`}><IoCloseOutline aria-hidden="true" /></button></header>
      {mode === "picker" ? <><div className="tab-modal-v2__sensor-dialog-actions"><div><span>已选摘要 {selection.summary.length}/{SYSTEM_SENSOR_SUMMARY_LIMIT} · 温度 {selection.temperatures.length}/{SYSTEM_SENSOR_TEMPERATURE_LIMIT}</span>{recommendationNotice && <span className="tab-modal-v2__sensor-dialog-notice" role="status" aria-live="polite">{recommendationNotice}</span>}</div><div><button type="button" onClick={onSaveRecommendation}>设为推荐</button><button type="button" onClick={onRestore}>恢复推荐</button></div></div><div className="tab-modal-v2__sensor-dialog-body">{pickerSensorsByCategory.length ? pickerSensorsByCategory.map(renderPickerGroup) : <p className="tab-modal-v2__sensor-dialog-empty">未发现可选传感器。可运行 HWiNFO（启用共享内存）或 LibreHardwareMonitor 后重试。</p>}</div></> : <div className="tab-modal-v2__sensor-dialog-body"><div className="tab-modal-v2__sensor-source-state"><span>HWiNFO：{sources?.hwinfo ? "已连接" : "未连接（需启用共享内存）"}</span><span>硬件监测：{sources?.hardwareMonitor ?? "未检测到"}</span><span>NVIDIA：{sources?.nvidia ? "已连接" : "未检测到"}</span></div>{detailSensorsByCategory.length ? detailSensorsByCategory.map((group) => <section className="tab-modal-v2__sensor-group" key={group.category}><h3>{sensorCategoryLabels[group.category]}</h3><dl>{group.sensors.map((sensor) => <div key={sensor.id}><dt>{sensorDisplayLabel(sensor)}<small>{sensorSemanticLabel(sensor)} · {sensor.sourceLabel}</small></dt><dd>{formatSensorValue(sensor)}</dd></div>)}</dl></section>) : <p className="tab-modal-v2__sensor-dialog-empty">未发现传感器。请确认 HWiNFO 或本机性能监测服务正在运行。</p>}</div>}
    </section>
  </div>;
}

type ProxyFeedbackTone = "pending" | "success" | "error";
type ProxyFeedback = { tone: ProxyFeedbackTone; message: string };

export function V2Page({ tab, nav, context }: { tab: V2TabKey; nav: string; context: V2BusinessContext }) {
  if (tab === "target") return <TargetPage nav={nav} context={context} />;
  if (tab === "local") return <LocalPage nav={nav} context={context} />;
  if (tab === "storage") return <StoragePage nav={nav} context={context} />;
  if (tab === "literature") return <LiteraturePage nav={nav} context={context} />;
  return <HddPage nav={nav} context={context} />;
}

function TargetPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { state, automation, actions } = context;
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIME);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    actions.addTask({ title: title.trim(), projectId: null, dueDate, dueTime, status: "active", priority: 3, folderPath: "", completedAt: null });
    setTitle("");
    setDueTime(DEFAULT_DUE_TIME);
  };
  const openTasks = state.tasks.filter((task) => task.status !== "completed");
  if (nav === "automation") return <div className="tab-modal-v2__page-stack">
    <ContentCard accent="gold" className="tab-modal-v2__timer-card"><div className="tab-modal-v2__timer-orbit"><IoTimerOutline aria-hidden="true" /></div><strong>{formatDuration(automation.seconds)}</strong><div className="tab-modal-v2__action-row"><ActionButton variant="primary" onClick={actions.toggleAutomation}>{automation.running ? "暂停计时" : "开始计时"}</ActionButton><ActionButton onClick={actions.resetAutomation}>重置</ActionButton></div></ContentCard>
  </div>;
  return <div className="tab-modal-v2__page-stack">
    {nav === "tasks" && <form className="tab-modal-v2__form-card" onSubmit={submit}><div><b>加入今天的队列</b></div><input aria-label="任务标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理文献摘要" /><input aria-label="截止日期" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><input aria-label="截止时间" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} /><ActionButton type="submit" variant="primary"><IoAddOutline />加入计划</ActionButton></form>}
    <CardRail title={nav === "tasks" ? "待办任务" : "今日目标"} showChrome={false}>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><strong>{openTasks.length}</strong><b>项待处理</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{openTasks.filter((task) => task.dueDate).length}</strong><b>项有日期</b></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><strong>{formatDuration(automation.seconds)}</strong><b>{automation.running ? "正在计时" : "已暂停"}</b></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><strong>{state.projects.length}</strong><b>个项目</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{state.tasks.filter((task) => task.status === "completed").length}</strong><b>项已完成</b></ContentCard>
    </CardRail>
    <section className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><b>{openTasks.length ? "待完成任务" : "队列已清空"}</b></div></div>{openTasks.length ? openTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => actions.toggleTask(task.id)} />) : <EmptyState title="今天没有待处理任务" detail="可以从上方新增一个小目标。" showDetail={false} icon={<IoCheckmarkCircleOutline aria-hidden="true" />} />}</section>
  </div>;
}

function TaskRow({ task, onToggle }: { task: { id: string; title: string; dueDate: string | null; dueTime?: string; status: string }; onToggle: () => void }) {
  return <button type="button" className={`tab-modal-v2__task-row${task.status === "completed" ? " is-done" : ""}`} onClick={onToggle}><span className={`tab-modal-v2__task-check${task.status === "completed" ? " is-checked" : ""}`} aria-hidden="true">{task.status === "completed" ? "✓" : ""}</span><span><b>{task.title}</b><small>{task.dueDate ? `${formatDueDate(task.dueDate)} ${formatDueTime(task.dueTime)}` : "未设置截止日"}</small></span><IoChevronMark /></button>;
}

function IoChevronMark() { return <span className="tab-modal-v2__row-mark" aria-hidden="true">↗</span>; }

export function LocalPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { networkMetrics, networkEgress, actions } = context;
  const network = networkMetrics.data;
  const egress = networkEgress.data.data;
  if (nav === "models") return <LocalModelSettingsPage context={context} />;
  if (nav === "network" || nav === "egress") return <div className="tab-modal-v2__page-stack">
    <section className="tab-modal-v2__network-hero"><div><strong>{nav === "egress" ? egress?.ip ?? (networkEgress.loading ? "自动检测中…" : "暂不可用") : network?.adapter.name ?? "正在读取适配器"}</strong></div>{nav === "network" && <div className="tab-modal-v2__network-actions"><ActionButton variant="primary" onClick={actions.launchFlClash}><IoGlobeOutline />恢复 FlClash</ActionButton></div>}</section>
    <CardRail title={nav === "egress" ? "出口信息" : "链路状态"} showChrome={false}>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><strong>{network?.latency.milliseconds === null || network?.latency.milliseconds === undefined ? "—" : `${network.latency.milliseconds} ms`}</strong><b>{network?.latency.target ?? "1.1.1.1:443"}</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{formatRate(network?.downloadBytesPerSecond)}</strong><b>下载速率</b></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><strong>{formatRate(network?.uploadBytesPerSecond)}</strong><b>上传速率</b></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><strong>{network?.flClash.running ? "ON" : "OFF"}</strong><b>{network?.flClash.launchConfigured ? "可启动" : "未配置"}</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{egress?.countryCode ?? "—"}</strong><b>{egress ? "已更新" : "自动更新"}</b></ContentCard>
    </CardRail>
    <section className="tab-modal-v2__detail-grid"><div className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><b>本机适配器</b></div></div><dl className="tab-modal-v2__definition-list"><div><dt>名称</dt><dd>{network?.adapter.name ?? "—"}</dd></div><div><dt>局域网 IP</dt><dd>{network?.adapter.localIpv4 ?? "—"}</dd></div><div><dt>链路速率</dt><dd>{network?.adapter.linkSpeed ?? "—"}</dd></div></dl></div></section>
  </div>;
  return <LocalOverview context={context} />;
}

const localModelContextLabels: Record<LocalModelContextLength, string> = {
  8192: "8K · 默认",
  16384: "16K",
  32768: "32K",
  65536: "64K",
  131072: "128K · 长上下文",
  204800: "200K · 超长上下文",
};
const localModelOutputLabels: Record<LocalModelOutputLength, string> = {
  4096: "4K · 默认",
  8192: "8K",
  16384: "16K",
};
const localModelThinkingLabels: Record<LocalModelThinking, string> = {
  off: "关闭思考",
  low: "低强度",
  medium: "中强度 · 默认",
  high: "高强度",
};

function LocalModelSettingsPage({ context }: { context: V2BusinessContext }) {
  const { localModels } = context;
  const [settings, setSettings] = useState<LocalModelSettings>(() => localModels.data.settings ?? DEFAULT_LOCAL_MODEL_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedModelName = localModels.data.selectedModel ?? localModels.data.models[0]?.name ?? DEFAULT_LOCAL_MODEL;
  const selectedThinking = localModelThinkingFor(settings, selectedModelName);

  useEffect(() => {
    if (localModels.data.settings) setSettings(localModels.data.settings);
  }, [localModels.data.settings]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/local-models/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: normalizeLocalModelSettings(settings) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload && typeof payload.message === "string" ? payload.message : "本地模型设置保存失败。");
      const next = parseLocalModelState(payload);
      if (next?.settings) setSettings(next.settings);
      setNotice("已保存；ObsUI 文献分析会使用新参数，OpenCode 可在模型选择器切换强度。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本地模型设置保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const updateNumber = (key: "temperature" | "topP" | "topK" | "minP" | "repeatPenalty", value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setSettings((current) => ({ ...current, [key]: next }));
  };

  return <div className="tab-modal-v2__page-stack">
    <section className="tab-modal-v2__list-panel tab-modal-v2__local-model-settings" aria-label="本地模型设置">
      <div className="tab-modal-v2__section-heading"><div><b>本地模型参数</b><small>ObsUI 文献分析与 OpenCode Desktop 共用本机 Ollama；模型文件不会重复下载。</small></div></div>
      <div className="tab-modal-v2__local-model-status-grid">
        <div><span>当前模型</span><b>{localModels.data.selectedModel ?? DEFAULT_LOCAL_MODEL}</b></div>
        <div><span>Ollama</span><b className={localModels.data.status === "ready" ? "is-ready" : "is-warning"}>{localModels.data.status === "ready" ? "在线" : "离线"}</b></div>
        <div><span>模型仓库</span><b title={localModels.data.modelRoot}>{localModels.data.modelRoot ?? "未读取"}</b></div>
        <div><span>OpenCode</span><b>Desktop · 本地 provider</b></div>
      </div>
      <form className="tab-modal-v2__local-model-form" onSubmit={(event) => void save(event)}>
        <label><span>上下文长度</span><select aria-label="上下文长度" value={settings.contextLength} onChange={(event) => setSettings((current) => ({ ...current, contextLength: Number(event.target.value) as LocalModelContextLength }))}>{LOCAL_MODEL_CONTEXT_LENGTHS.map((value) => <option key={value} value={value}>{localModelContextLabels[value]}</option>)}</select></label>
        <label><span>最大输出</span><select aria-label="最大输出" value={settings.maxOutputTokens} onChange={(event) => setSettings((current) => ({ ...current, maxOutputTokens: Number(event.target.value) as LocalModelOutputLength }))}>{LOCAL_MODEL_OUTPUT_LENGTHS.map((value) => <option key={value} value={value}>{localModelOutputLabels[value]}</option>)}</select></label>
        <label><span>当前模型思考强度</span><select aria-label="思考强度" value={selectedThinking} onChange={(event) => setSettings((current) => withLocalModelThinking(current, selectedModelName, event.target.value as LocalModelThinking))}>{LOCAL_MODEL_THINKING_LEVELS.map((value) => <option key={value} value={value}>{localModelThinkingLabels[value]}</option>)}</select></label>
        <label><span>Temperature</span><input aria-label="Temperature" type="number" min="0" max="2" step="0.05" value={settings.temperature} onChange={(event) => updateNumber("temperature", event.target.value)} /></label>
        <label><span>Top P</span><input aria-label="Top P" type="number" min="0" max="1" step="0.05" value={settings.topP} onChange={(event) => updateNumber("topP", event.target.value)} /></label>
        <label><span>Top K</span><input aria-label="Top K" type="number" min="0" max="100" step="1" value={settings.topK} onChange={(event) => updateNumber("topK", event.target.value)} /></label>
        <label><span>Min P</span><input aria-label="Min P" type="number" min="0" max="1" step="0.01" value={settings.minP} onChange={(event) => updateNumber("minP", event.target.value)} /></label>
        <label><span>Repeat penalty</span><input aria-label="Repeat penalty" type="number" min="0.8" max="2" step="0.05" value={settings.repeatPenalty} onChange={(event) => updateNumber("repeatPenalty", event.target.value)} /></label>
        <div className="tab-modal-v2__local-model-form-actions"><ActionButton type="submit" variant="primary" disabled={saving}>{saving ? "保存中…" : "保存本地参数"}</ActionButton>{notice && <span role="status" aria-live="polite">{notice}</span>}</div>
      </form>
      <p className="tab-modal-v2__local-model-note">8K 是当前默认档；128K 适合长文献/大仓库；200K 仅用于超长上下文，可能转为 GPU 与内存混合运行。OpenCode Desktop 的 `off / low / medium / high` 思考强度会显示在模型选择器中。</p>
    </section>
  </div>;
}

function DeviceProfileField({ icon, label, primary, detail }: { icon: ReactNode; label: string; primary: string | null; detail?: string | null }) {
  return <div className="tab-modal-v2__device-profile-field">
    <span className="tab-modal-v2__device-profile-field-icon">{icon}</span>
    <div className="tab-modal-v2__device-profile-field-copy">
      <span>{label}</span>
      <b title={primary ?? "暂不可用"}>{primary ?? "暂不可用"}</b>
      {detail && <small title={detail}>{detail}</small>}
    </div>
  </div>;
}

function DeviceProfileCard({ profile, status }: { profile: DeviceProfile | null; status: "loading" | "ready" | "unavailable" }) {
  const stateLabel = profile ? "已读取" : status === "loading" ? "读取中" : "暂不可用";
  const stateTone = profile ? "ready" : status === "loading" ? "loading" : "unavailable";
  const gpuPrimary = profile?.gpus.length ? profile.gpus.map((gpu) => gpu.name).join(" / ") : null;
  const gpuDetail = profile?.gpus.length ? profile.gpus.map((gpu) => formatDeviceParts([gpu.memoryBytes !== null ? formatDeviceBytes(gpu.memoryBytes) : null, gpu.memoryType, gpu.driverVersion ? `驱动 ${gpu.driverVersion}` : null])).filter(Boolean).join(" / ") : null;
  const memoryPrimary = profile ? formatDeviceBytes(profile.memory.totalBytes) : null;
  const memoryDetail = profile ? formatDeviceParts([
    profile.memory.modules.length ? `${profile.memory.modules.length} 个模块` : null,
    profile.memory.speedMHz !== null ? `${profile.memory.speedMHz} MHz` : null,
    profile.memory.channels !== null ? `${profile.memory.channels} 通道` : null,
  ]) : null;
  const memoryModules = profile?.memory.modules.map((module) => formatDeviceParts([
    module.locator,
    module.capacityBytes !== null ? formatDeviceBytes(module.capacityBytes) : null,
    module.speedMHz !== null ? `${module.speedMHz} MHz` : null,
    module.memoryType,
  ])).filter(Boolean).join(" / ") || null;
  const storagePrimary = profile?.storage.length ? profile.storage.map((disk) => disk.model).join(" / ") : null;
  const storageDetail = profile?.storage.length ? profile.storage.map((disk) => formatDeviceParts([
    disk.sizeBytes !== null ? formatDeviceBytes(disk.sizeBytes) : null,
    disk.type,
    disk.interfaceType,
  ])).filter(Boolean).join(" / ") : null;
  const displayPrimary = profile?.displays.length ? profile.displays.map((display) => display.name).join(" / ") : null;
  const displayDetail = profile?.displays.length ? profile.displays.map((display) => formatDeviceParts([
    formatDeviceResolution(display.width, display.height, display.refreshRateHz),
    display.sizeInches !== null ? `${display.sizeInches} 英寸` : null,
  ])).filter(Boolean).join(" / ") : null;

  return <ContentCard accent="blue" className="tab-modal-v2__overview-card tab-modal-v2__device-profile-card" data-overview-card="device-profile" aria-label="设备档案">
    <div className="tab-modal-v2__card-top">
      <span className="tab-modal-v2__card-icon"><IoDesktopOutline aria-hidden="true" /></span>
      <span className={`tab-modal-v2__overview-status tab-modal-v2__overview-status--${stateTone === "ready" ? "ready" : stateTone === "loading" ? "warning" : "muted"}`}><i />{stateLabel}</span>
    </div>
    <div className="tab-modal-v2__overview-card-heading"><b>设备档案</b></div>
    {profile ? <div className="tab-modal-v2__device-profile-grid">
      <DeviceProfileField icon={<IoDocumentTextOutline aria-hidden="true" />} label="操作系统" primary={profile.os.name} detail={formatDeviceParts([profile.os.version, profile.os.architecture]) || null} />
      <DeviceProfileField icon={<IoHardwareChipOutline aria-hidden="true" />} label="处理器" primary={profile.cpu.name} detail={formatDeviceParts([
        profile.cpu.cores !== null ? `${profile.cpu.cores} 核` : null,
        profile.cpu.threads !== null ? `${profile.cpu.threads} 线程` : null,
        profile.cpu.clockMHz !== null ? `${profile.cpu.clockMHz} MHz` : null,
        profile.cpu.process,
      ]) || null} />
      <DeviceProfileField icon={<IoCubeOutline aria-hidden="true" />} label="显卡" primary={gpuPrimary} detail={gpuDetail} />
      <DeviceProfileField icon={<IoServerOutline aria-hidden="true" />} label="主板" primary={profile.motherboard.model} detail={formatDeviceParts([profile.motherboard.manufacturer, profile.motherboard.chipset]) || null} />
      <DeviceProfileField icon={<IoServerOutline aria-hidden="true" />} label="硬盘" primary={storagePrimary} detail={storageDetail} />
      <DeviceProfileField icon={<IoDesktopOutline aria-hidden="true" />} label="显示器" primary={displayPrimary} detail={displayDetail} />
      <DeviceProfileField icon={<IoLayersOutline aria-hidden="true" />} label="内存" primary={memoryPrimary} detail={formatDeviceParts([memoryDetail, memoryModules]) || null} />
    </div> : <div className="tab-modal-v2__device-profile-empty">{status === "loading" ? "正在读取本机硬件信息…" : "本机设备信息暂不可用，当前不使用推测值。"}</div>}
  </ContentCard>;
}

function LocalOverview({ context }: { context: V2BusinessContext }) {
  const { systemMetrics, networkMetrics, networkEgress, localModels, codexUsage, actions } = context;
  const [proxyMenuOpen, setProxyMenuOpen] = useState(false);
  const [proxyActionPending, setProxyActionPending] = useState<string | null>(null);
  const [proxyFeedback, setProxyFeedback] = useState<ProxyFeedback | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null);
  const [modelThinkingDraft, setModelThinkingDraft] = useState<LocalModelThinking>("medium");
  const [modelSettings, setModelSettings] = useState<LocalModelSettings>(() => localModels.data.settings ?? DEFAULT_LOCAL_MODEL_SETTINGS);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelRunnerAction, setModelRunnerAction] = useState<string | null>(null);
  const [modelFeedback, setModelFeedback] = useState<ProxyFeedback | null>(null);
  const proxyMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const metrics = systemMetrics.data;
  const network = networkMetrics.data;
  const egress = networkEgress.data.data;
  const egressValue = egress?.ip ?? (networkEgress.loading ? "查询中…" : networkEgress.data.status === "unconfigured" ? "未配置" : networkEgress.data.status === "unavailable" ? "暂不可用" : "尚未刷新");
  const allLocalModelRows = groupLocalModels(localModels.data.models);
  const localModelRows = allLocalModelRows.slice(0, 3);
  const localModelStatus = localModels.loading ? "读取中" : localModels.data.status === "ready" ? "在线" : "离线";
  const localModelTone: OverviewStatusTone = localModels.loading ? "warning" : localModels.data.status === "ready" ? "ready" : "warning";
  const localModelDisplayNames = localModelRows.length
    ? localModelRows.map((model) => model.name)
    : [localModels.loading ? "读取中…" : localModels.data.status === "unavailable" ? "Ollama 未连接" : "未检测到模型"];

  useEffect(() => {
    if (!proxyMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!proxyMenuRef.current?.contains(event.target as Node)) setProxyMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [proxyMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (localModels.data.settings) setModelSettings(localModels.data.settings);
  }, [localModels.data.settings]);

  useEffect(() => {
    if (!proxyFeedback) return;
    const timer = window.setTimeout(() => setProxyFeedback(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [proxyFeedback]);

  useEffect(() => {
    if (!modelFeedback || modelFeedback.tone === "pending") return;
    const timer = window.setTimeout(() => setModelFeedback(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [modelFeedback]);

  const runProxyAction = async (label: string, action: () => void | Promise<ProxyLaunchResult>) => {
    if (proxyActionPending) return;
    setProxyActionPending(label);
    setProxyFeedback({ tone: "pending", message: `正在打开 ${label}…` });
    try {
      const result = await action();
      if (result && !result.ok) {
        setProxyFeedback({ tone: "error", message: result.message });
      } else {
        setProxyFeedback({ tone: "success", message: result?.message ?? `${label}已请求打开。` });
      }
    } catch (error) {
      setProxyFeedback({ tone: "error", message: error instanceof Error ? error.message : `无法打开 ${label}。` });
    } finally {
      setProxyActionPending(null);
    }
  };

  const editModelThinking = (modelName: string) => {
    setSelectedModelName(modelName);
    setModelThinkingDraft(localModelThinkingFor(modelSettings, modelName));
    setModelFeedback(null);
  };

  const saveModelThinking = async () => {
    if (!selectedModelName || modelSaving) return;
    const nextSettings = withLocalModelThinking(modelSettings, selectedModelName, modelThinkingDraft);
    setModelSaving(true);
    setModelFeedback({ tone: "pending", message: `正在保存 ${selectedModelName}…` });
    try {
      const response = await fetch("/api/local-models/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload && typeof payload.message === "string" ? payload.message : "模型思考强度保存失败。");
      const nextState = parseLocalModelState(payload);
      if (!nextState?.settings) throw new Error("本地模型设置回读失败。");
      setModelSettings(nextState.settings);
      setModelThinkingDraft(localModelThinkingFor(nextState.settings, selectedModelName));
      setModelFeedback({ tone: "success", message: `${selectedModelName} 已设为${localModelThinkingLabels[modelThinkingDraft]}。` });
    } catch (error) {
      setModelFeedback({ tone: "error", message: error instanceof Error ? error.message : "模型思考强度保存失败。" });
    } finally {
      setModelSaving(false);
    }
  };

  const runningModelNames = new Set(localModels.data.busy?.runningModels ?? []);
  const runtimeTagForModel = (model: (typeof allLocalModelRows)[number]) => localModels.data.selectedModel && model.variants.includes(localModels.data.selectedModel)
    ? localModels.data.selectedModel
    : model.variants[0] ?? model.name;
  const modelIsRunning = (model: (typeof allLocalModelRows)[number]) => model.variants.some((variant) => runningModelNames.has(variant));
  const runModelControl = async (action: LocalModelControlAction, modelName?: string) => {
    if (modelRunnerAction) return;
    const actionKey = `${action}:${modelName ?? "service"}`;
    const actionLabel = action.startsWith("start") ? "启动" : "关闭";
    const targetLabel = modelName ? `模型 ${modelName}` : "Ollama";
    setModelRunnerAction(actionKey);
    setModelFeedback({ tone: "pending", message: `正在${actionLabel} ${targetLabel}…` });
    try {
      const response = await fetch("/api/local-models/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(modelName ? { model: modelName } : {}) }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || payload?.ok === false) throw new Error(typeof payload?.message === "string" ? payload.message : `无法${actionLabel} ${targetLabel}。`);
      setModelFeedback({ tone: "success", message: payload?.message ?? `${targetLabel}已${actionLabel}。` });
      localModels.refresh();
    } catch (error) {
      setModelFeedback({ tone: "error", message: error instanceof Error ? error.message : `${targetLabel}${actionLabel}失败。` });
    } finally {
      setModelRunnerAction(null);
    }
  };

  return <div className="tab-modal-v2__page-stack tab-modal-v2__local-overview">
    <section className="tab-modal-v2__list-panel" aria-label="Codex 使用限额">
      <div className="tab-modal-v2__section-heading"><div><b>Codex 使用限额</b><small>{codexUsage.status === "ready" && codexUsage.data ? `每 60 秒读取 · 采样于 ${new Date(codexUsage.data.sampledAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : codexUsage.status === "loading" ? "正在读取本机记录" : "本机额度记录不可用"}</small></div></div>
      {(() => {
        const windows = codexUsage.data ? sortCodexUsageWindows(codexUsage.data.windows) : [];
        return <div className="tab-modal-v2__quota-windows" aria-label="Codex 额度窗口">{windows.length ? windows.map((window) => <div className="tab-modal-v2__quota-window" key={window.windowMinutes}><div className="tab-modal-v2__quota-line"><strong>{window.remainingPercent}%</strong><span>{codexUsageWindowLabel(window.windowMinutes)}剩余</span><span>已使用 {window.usedPercent}%</span></div><div className="tab-modal-v2__meter"><i style={{ width: `${window.remainingPercent}%` }} /></div><small>重置于 {formatQuotaReset(window.resetsAt, window.windowMinutes)}</small></div>) : <div className="tab-modal-v2__quota-empty">{codexUsage.status === "loading" ? "正在读取额度…" : "本机额度记录不可用"}</div>}</div>;
      })()}
    </section>
    <CardRail title="本机状态" className="tab-modal-v2__overview-rail" showChrome={false} showEdgeControls>
      <DeviceProfileCard profile={metrics?.device ?? null} status={systemMetrics.status} />
      <SystemSensorCard metrics={metrics} />

      <ContentCard accent="gold" className="tab-modal-v2__overview-card tab-modal-v2__network-overview-card" data-overview-card="network" aria-label="网络状态">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoGlobeOutline aria-hidden="true" /></span></div>
        <div className="tab-modal-v2__overview-card-heading"><b>网络状态</b></div>
        <div className="tab-modal-v2__network-rate-grid"><div><span>下载</span><strong>{formatRate(network?.downloadBytesPerSecond)}</strong></div><div><span>上传</span><strong>{formatRate(network?.uploadBytesPerSecond)}</strong></div></div>
        <dl className="tab-modal-v2__overview-field-list"><div><dt>局域网 IP</dt><dd>{network?.adapter.localIpv4 ?? "—"}</dd></div><div><dt>出口 IP</dt><dd>{egressValue}</dd></div><div><dt>FlClash</dt><dd>{network?.flClash.running ? "运行中" : network?.flClash.launchConfigured ? "可启动" : "未配置"}</dd></div></dl>
        <div className="tab-modal-v2__overview-proxy-actions" ref={proxyMenuRef} aria-busy={proxyActionPending !== null}>
          <div className="tab-modal-v2__overview-action-row"><ActionButton variant="primary" type="button" aria-haspopup="dialog" aria-expanded={proxyMenuOpen} aria-controls="obsui-proxy-settings" onClick={() => { setModelMenuOpen(false); setProxyMenuOpen((open) => !open); }} disabled={proxyActionPending !== null}>打开代理</ActionButton></div>
          {proxyMenuOpen && <section id="obsui-proxy-settings" className="tab-modal-v2__proxy-settings-popover" role="dialog" aria-label="代理设置"><header className="tab-modal-v2__proxy-settings-popover-header"><div><span className="tab-modal-v2__proxy-settings-popover-icon"><IoSettingsOutline aria-hidden="true" /></span><div><h2>代理设置</h2><p>本机代理客户端</p></div></div><ActionButton autoFocus aria-label="关闭代理设置" title="关闭代理设置" onClick={() => setProxyMenuOpen(false)}><IoCloseOutline aria-hidden="true" /></ActionButton></header><div className="tab-modal-v2__proxy-settings-popover-body"><b className="tab-modal-v2__proxy-settings-popover-section">代理客户端</b><button type="button" className="tab-modal-v2__proxy-settings-item" data-proxy-client="flclash" onClick={() => { setProxyMenuOpen(false); void runProxyAction("FlClash", actions.launchFlClash); }} disabled={proxyActionPending !== null}><span className="tab-modal-v2__proxy-settings-item-icon"><img src={flClashIconUrl} alt="" /></span><span><b>打开 FlClash</b><small>{network?.flClash.running ? "已运行，可恢复窗口" : network?.flClash.launchConfigured ? "本机已配置启动路径" : "尚未配置启动路径"}</small></span><IoChevronMark /></button><button type="button" className="tab-modal-v2__proxy-settings-item" data-proxy-client="clash-verge" onClick={() => { setProxyMenuOpen(false); void runProxyAction("Clash Verge", actions.launchClashVerge); }} disabled={proxyActionPending !== null}><span className="tab-modal-v2__proxy-settings-item-icon"><img src={clashVergeIconUrl} alt="" /></span><span><b>打开 Clash Verge</b><small>若已安装，则启动或恢复窗口</small></span><IoChevronMark /></button></div></section>}
          {proxyFeedback && <div className={`tab-modal-v2__overview-action-feedback tab-modal-v2__overview-action-feedback--${proxyFeedback.tone}`} role={proxyFeedback.tone === "error" ? "alert" : "status"} aria-live="polite">{proxyFeedback.message}</div>}
        </div>
      </ContentCard>

       <ContentCard accent="violet" className="tab-modal-v2__overview-card tab-modal-v2__local-model-overview-card" data-overview-card="local-model" aria-label="本地模型">
         <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoCubeOutline aria-hidden="true" /></span></div>
         <div className="tab-modal-v2__overview-card-heading"><b>本地模型</b></div>
         <div className="tab-modal-v2__overview-model-list" aria-label="已安装本地模型">
           {localModelDisplayNames.map((modelName) => <div className="tab-modal-v2__overview-model-row" key={modelName}>
             <span className="tab-modal-v2__overview-model-row-icon" aria-hidden="true"><IoCubeOutline /></span>
             <b title={modelName}>{modelName}</b>
             <span className={`tab-modal-v2__model-status tab-modal-v2__model-status--${localModelTone}`} title={localModelStatus}><i className={`tab-modal-v2__model-status-dot tab-modal-v2__model-status-dot--${localModelTone}`} aria-hidden="true" />{localModelStatus}</span>
           </div>)}
         </div>
         <div className="tab-modal-v2__overview-proxy-actions tab-modal-v2__overview-model-actions" ref={modelMenuRef} aria-busy={modelSaving || modelRunnerAction !== null}>
           <div className="tab-modal-v2__overview-action-row"><ActionButton variant={localModels.data.status === "ready" ? "danger" : "primary"} type="button" data-local-model-control={localModels.data.status === "ready" ? "stop-service" : "start-service"} onClick={() => void runModelControl(localModels.data.status === "ready" ? "stop-service" : "start-service")} disabled={localModels.loading || modelSaving || modelRunnerAction !== null}>{localModels.loading ? "读取中…" : localModels.data.status === "ready" ? "关闭" : "启动"}</ActionButton><ActionButton variant="primary" type="button" aria-haspopup="dialog" aria-expanded={modelMenuOpen} aria-controls="obsui-local-model-settings" onClick={() => { setProxyMenuOpen(false); setSelectedModelName(null); setModelFeedback(null); setModelMenuOpen((open) => !open); }} disabled={!allLocalModelRows.length || modelSaving || modelRunnerAction !== null}>模型设置</ActionButton></div>
          {modelMenuOpen && <section id="obsui-local-model-settings" className="tab-modal-v2__proxy-settings-popover tab-modal-v2__local-model-settings-popover" role="dialog" aria-label="本地模型设置">
             <header className="tab-modal-v2__proxy-settings-popover-header"><div><span className="tab-modal-v2__proxy-settings-popover-icon"><IoCubeOutline aria-hidden="true" /></span><div><h2>本地模型设置</h2><p>{selectedModelName ?? "选择模型后调整思考强度"}</p></div></div><ActionButton autoFocus aria-label="关闭本地模型设置" title="关闭本地模型设置" onClick={() => setModelMenuOpen(false)}><IoCloseOutline aria-hidden="true" /></ActionButton></header>
             <div className="tab-modal-v2__proxy-settings-popover-body">
               <section className="tab-modal-v2__local-model-runner" aria-label="Ollama 服务控制"><div className="tab-modal-v2__local-model-runner-heading"><div><b>Ollama 服务</b><small>控制本机服务，不会删除模型文件。</small></div><span className={localModels.data.status === "ready" ? "is-ready" : "is-warning"}>{localModelStatus}</span></div><div className="tab-modal-v2__local-model-runner-actions"><ActionButton variant="primary" type="button" data-local-model-control="start-service" onClick={() => void runModelControl("start-service")} disabled={localModels.loading || localModels.data.status === "ready" || modelRunnerAction !== null}><IoPlayOutline aria-hidden="true" />启动</ActionButton><ActionButton variant="danger" type="button" data-local-model-control="stop-service" onClick={() => void runModelControl("stop-service")} disabled={localModels.loading || localModels.data.status !== "ready" || modelRunnerAction !== null}><IoPowerOutline aria-hidden="true" />关闭</ActionButton></div></section>
               {selectedModelName ? <>
                <button type="button" className="tab-modal-v2__local-model-back" onClick={() => { setSelectedModelName(null); setModelFeedback(null); }}>← 返回模型列表</button>
                <div className="tab-modal-v2__local-model-thinking-editor">
                  <div><span>模型</span><b>{selectedModelName}</b></div>
                  <label><span>思考强度</span><select aria-label={`${selectedModelName} 思考强度`} value={modelThinkingDraft} onChange={(event) => setModelThinkingDraft(event.target.value as LocalModelThinking)}>{LOCAL_MODEL_THINKING_LEVELS.map((value) => <option key={value} value={value}>{localModelThinkingLabels[value]}</option>)}</select></label>
                  <small>{modelThinkingDraft === "off" ? "速度优先；适合批量文献提取。" : modelThinkingDraft === "low" ? "较快；兼顾基础推理。" : modelThinkingDraft === "medium" ? "质量与速度平衡；当前默认。" : "复杂推理优先；分析耗时会明显增加。"}</small>
                  <ActionButton variant="primary" type="button" onClick={() => void saveModelThinking()} disabled={modelSaving}>{modelSaving ? "保存中…" : "保存思考强度"}</ActionButton>
                </div>
               </> : <>
                 <b className="tab-modal-v2__proxy-settings-popover-section">已安装模型</b>
                 {allLocalModelRows.length ? allLocalModelRows.map((model) => {
                   const runtimeTag = runtimeTagForModel(model);
                   const running = modelIsRunning(model);
                   return <div className="tab-modal-v2__local-model-item" key={model.name}>
                     <button type="button" className="tab-modal-v2__proxy-settings-item" data-local-model={model.name} onClick={() => editModelThinking(model.name)}><span className="tab-modal-v2__proxy-settings-item-icon"><IoCubeOutline aria-hidden="true" /></span><span><b>{model.name}</b><small>{localModelThinkingLabels[localModelThinkingFor(modelSettings, model.name)]} · {model.variants.length} 个上下文档位 · {running ? "运行中" : "未加载"}</small></span><IoChevronMark /></button>
                     <div className="tab-modal-v2__local-model-item-actions"><ActionButton variant="primary" type="button" data-local-model-action="start" data-local-model-name={runtimeTag} onClick={() => void runModelControl("start-model", runtimeTag)} disabled={modelRunnerAction !== null || localModels.loading || running}><IoPlayOutline aria-hidden="true" />启动</ActionButton><ActionButton variant="danger" type="button" data-local-model-action="stop" data-local-model-name={runtimeTag} onClick={() => void runModelControl("stop-model", runtimeTag)} disabled={modelRunnerAction !== null || localModels.loading || !running}><IoPowerOutline aria-hidden="true" />关闭</ActionButton></div>
                   </div>;
                 }) : <span className="tab-modal-v2__local-model-empty">Ollama 在线后读取已安装模型。</span>}
               </>}
            </div>
          </section>}
          {modelFeedback && <div className={`tab-modal-v2__overview-action-feedback tab-modal-v2__overview-action-feedback--${modelFeedback.tone}`} role={modelFeedback.tone === "error" ? "alert" : "status"} aria-live="polite">{modelFeedback.message}</div>}
        </div>
      </ContentCard>

      <ContentCard accent="green" className="tab-modal-v2__overview-card tab-modal-v2__automation-overview-card" data-overview-card="automation" aria-label="Codex 自动化">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoTimerOutline aria-hidden="true" /></span></div>
        <div className="tab-modal-v2__overview-card-heading"><b>Codex 自动化</b></div>
        <dl className="tab-modal-v2__overview-field-list"><div><dt>运行周期</dt><dd>未配置</dd></div><div><dt>状态</dt><dd>未接入</dd></div><div><dt>上次运行</dt><dd>—</dd></div><div><dt>下次运行</dt><dd>—</dd></div></dl>
      </ContentCard>
    </CardRail>
  </div>;
}

function StoragePage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { state, actions } = context;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("research");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    actions.addProject({ title: title.trim(), kind, status: "active", tags: [], description: "", });
    setTitle("");
  };
  const projects = state.projects;
  const resources = state.resources;
  return <div className="tab-modal-v2__page-stack">
    {nav === "projects" && <form className="tab-modal-v2__form-card" onSubmit={submit}><div><span className="tab-modal-v2__micro-label">NEW PROJECT</span><b>建立一个本地索引</b><small>项目内容仍由原有业务状态管理。</small></div><input aria-label="项目名称" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：焊接接头研究" /><select aria-label="项目类型" value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}><option value="research">科研</option><option value="course">课程</option><option value="personal">个人</option></select><ActionButton type="submit" variant="primary"><IoAddOutline />加入仓库</ActionButton></form>}
    <CardRail title={nav === "resources" ? "资料入口" : "项目索引"} showChrome={false}>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">PROJECTS</span><strong>{projects.length}</strong><b>个项目</b><small>活跃索引由本机数据库提供。</small></ContentCard>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">RESOURCES</span><strong>{resources.length}</strong><b>个资料入口</b><small>网页、本机路径或备注。</small></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">ACTIVE</span><strong>{projects.filter((project) => project.status === "active").length}</strong><b>个活跃项目</b><small>只显示当前业务状态。</small></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">TASK LINKS</span><strong>{state.tasks.filter((task) => task.projectId).length}</strong><b>项已关联任务</b><small>关联关系可在原有页面继续维护。</small></ContentCard>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">RECYCLE</span><strong>{state.recycleBin.length}</strong><b>项可恢复</b><small>回收站不会自动清理内容。</small></ContentCard>
    </CardRail>
    {nav === "resources" ? <section className="tab-modal-v2__list-panel">{resources.length ? resources.map((resource) => <div className="tab-modal-v2__resource-row" key={resource.id}><span className="tab-modal-v2__row-icon"><IoLinkOutline /></span><span><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></span><IoChevronMark /></div>) : <EmptyState title="还没有关联资料" detail="前往文献 Tab 保存一个可回到的入口。" icon={<IoDocumentTextOutline aria-hidden="true" />} />}</section> : <section className="tab-modal-v2__project-grid">{projects.length ? projects.map((project) => <ContentCard key={project.id} accent={project.kind === "research" ? "gold" : project.kind === "course" ? "blue" : "violet"}><span className="tab-modal-v2__card-code">{kindLabel[project.kind]}</span><h2>{project.title}</h2><p>{project.description || "还没有项目说明。"}</p><div className="tab-modal-v2__project-meta"><span>{state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length} 个待办</span><span>{resources.filter((resource) => resource.projectId === project.id).length} 个资料</span></div></ContentCard>) : <EmptyState title="项目仓库为空" detail="可以在这里建立一个本地项目索引。" />}</section>}
  </div>;
}

function LiteraturePage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const { state, actions } = context;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !location.trim()) return;
    actions.addResource({ title: title.trim(), location: location.trim(), kind: "link", projectId: null, tags: [] });
    setTitle("");
    setLocation("");
  };
  return <div className="tab-modal-v2__page-stack">
    {nav === "save" && <form className="tab-modal-v2__form-card tab-modal-v2__literature-form" onSubmit={submit}><div><span className="tab-modal-v2__micro-label">LITERATURE ENTRY</span><b>保存一个可回到的入口</b><small>不会自动读取或写入 ResearchKB Vault 文件。</small></div><input aria-label="资料名称" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="资料标题" /><input aria-label="资料地址" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="https:// 或本机路径" /><ActionButton type="submit" variant="primary"><IoAddOutline />保存入口</ActionButton></form>}
    <CardRail title="最近入口" showChrome={false}><ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">DOCKED</span><strong>{state.resources.length}</strong><b>个资料入口</b><small>每一项都可以回到原始位置。</small></ContentCard><ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LINKS</span><strong>{state.resources.filter((resource) => resource.kind === "link").length}</strong><b>个链接</b><small>保持来源路径不变。</small></ContentCard><ContentCard accent="green" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LOCAL FILES</span><strong>{state.resources.filter((resource) => resource.kind === "file").length}</strong><b>个本机路径</b><small>仅保存入口信息。</small></ContentCard><ContentCard accent="violet" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">NOTES</span><strong>{state.resources.filter((resource) => resource.kind === "note").length}</strong><b>个备注</b><small>数据由本地数据库保存。</small></ContentCard><ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LOCAL ONLY</span><strong>100%</strong><b>本机保存</b><small>不会自动上传文献内容。</small></ContentCard></CardRail>
    <section className="tab-modal-v2__list-panel">{state.resources.length ? state.resources.map((resource) => <div className="tab-modal-v2__resource-row" key={resource.id}><span className="tab-modal-v2__row-icon"><IoBookOutline /></span><span><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></span><IoChevronMark /></div>) : <EmptyState title="还没有资料入口" detail="从保存入口开始添加网页、本机路径或备注。" icon={<IoBookOutline aria-hidden="true" />} />}</section>
  </div>;
}

function HddPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const chat = useHddChat();
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void chat.sendMessage(); }
  };
  if (nav === "sources") return <div className="tab-modal-v2__page-stack"><section className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><span className="tab-modal-v2__micro-label">SOURCES</span><b>最近回答的来源</b></div><span>{chat.lastCitations.length} ITEMS</span></div>{chat.lastCitations.length ? <div className="tab-modal-v2__source-list">{chat.lastCitations.map((citation) => <div className="tab-modal-v2__resource-row" key={citation.path}><span className="tab-modal-v2__row-icon"><IoDocumentTextOutline /></span><span><b>{citation.label}</b><small>{citation.path}</small></span></div>)}</div> : <EmptyState title="还没有来源" detail="H.D.D 回答中的 Source 行会出现在这里。" icon={<IoDocumentTextOutline aria-hidden="true" />} />}</section></div>;
  if (nav === "settings") return <div className="tab-modal-v2__page-stack"><ContentCard accent="gold" className="tab-modal-v2__hdd-status-card"><div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoSettingsOutline /></span><span className={`tab-modal-v2__live-pill${chat.status?.available ? " is-ready" : ""}`}><i />{chat.status?.available ? "ONLINE" : chat.status ? "OFFLINE" : "CHECKING"}</span></div><h2>H.D.D 本机桥接</h2><p>当前 V2 页面只复用本机接口能力，不复用旧弹窗的 DOM 或外壳。知识镜像保持只读，回答和历史会话保存在本机桥接目录。</p><div className="tab-modal-v2__definition-list"><div><span>版本</span><b>{chat.status?.version ?? "—"}</b></div><div><span>状态</span><b>{chat.status?.message ?? "正在检查本机 Codex CLI"}</b></div></div><ActionButton variant="quiet" onClick={context.actions.openSettings}>打开工作台设置</ActionButton></ContentCard></div>;
  return <div className="tab-modal-v2__hdd-layout"><aside className="tab-modal-v2__hdd-sessions"><header><div><span className="tab-modal-v2__micro-label">CONVERSATIONS</span><b>会话</b></div><ActionButton aria-label="新建会话" title="新建会话" onClick={() => void chat.createConversation()}><IoAddOutline /></ActionButton></header><div className="tab-modal-v2__hdd-session-list">{chat.conversations.map((conversation) => <button type="button" key={conversation.id} className={`tab-modal-v2__hdd-session${conversation.id === chat.active?.id ? " is-selected" : ""}`} onClick={() => void chat.openConversation(conversation.id)}><IoChatbubbleEllipsesOutline /><span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button>)}{!chat.conversations.length && <span className="tab-modal-v2__hdd-muted">还没有会话</span>}</div></aside><section className="tab-modal-v2__hdd-conversation"><header className="tab-modal-v2__hdd-conversation-header"><div><span className="tab-modal-v2__micro-label">LOCAL CODEX</span><h2>{chat.active?.title ?? "新会话"}</h2></div><div className="tab-modal-v2__hdd-header-actions">{chat.active && <ActionButton aria-label="删除当前会话" title="删除当前会话" onClick={() => chat.requestDelete()}><IoTrashOutline /></ActionButton>}<span className="tab-modal-v2__live-pill"><i />{chat.status?.available ? "在线" : chat.status ? "离线" : "检查中"}</span></div></header><div className="tab-modal-v2__hdd-messages" ref={chat.messagesRef}>{chat.loadingConversation && <span className="tab-modal-v2__hdd-muted">正在读取会话…</span>}{chat.active?.messages.map((message) => <article className={`tab-modal-v2__hdd-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "H.D.D"}</span><p>{message.content || (chat.loading ? "正在生成…" : "")}</p></article>)}{!chat.loadingConversation && !chat.active && <EmptyState title="从一个问题开始" detail="本机 Codex 只读回答，不会联网或修改文件。" icon={<IoChatbubbleEllipsesOutline aria-hidden="true" />} />}</div>{chat.error && <div className="tab-modal-v2__hdd-error" role="status">{chat.error}</div>}<form className="tab-modal-v2__hdd-composer" onSubmit={(event) => void chat.sendMessage(event)}><textarea value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={chat.status?.available ? "向 H.D.D 提问…" : "Codex CLI 离线时不会伪造回答"} disabled={chat.loading || !chat.status?.available} rows={2} aria-label="向 H.D.D 提问" />{chat.loading ? <ActionButton type="button" variant="danger" onClick={chat.stopGeneration} aria-label="停止生成"><IoStopCircleOutline /></ActionButton> : <ActionButton type="submit" variant="primary" disabled={!chat.draft.trim() || !chat.status?.available} aria-label="发送消息"><IoPaperPlaneOutline /></ActionButton>}</form></section>{chat.deleteCandidate && <div className="tab-modal-v2__confirm" role="dialog" aria-modal="true"><b>删除这个会话？</b><p>历史 JSON 将被移除，且无法从 ObsUI 恢复。</p><div><ActionButton onClick={chat.cancelDelete}>取消</ActionButton><ActionButton variant="danger" onClick={() => void chat.deleteConversation()}><IoTrashOutline />确认删除</ActionButton></div></div>}</div>;
}
