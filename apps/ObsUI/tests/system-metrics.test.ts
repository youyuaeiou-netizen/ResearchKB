import { defaultSystemSensorSelection, normalizeSystemSensorSelection, parseSystemMetrics, SYSTEM_SENSOR_SUMMARY_LIMIT, SYSTEM_SENSOR_TEMPERATURE_LIMIT } from "../src/system-metrics";

const sensors = [
  { id: "windows:cpu-load", label: "CPU 占用", category: "cpu", kind: "load", value: 12.7, unit: "%", source: "windows", sourceLabel: "Windows", role: "cpu-load" },
  { id: "nvidia:0:core-clock", label: "GPU 0 核心频率", category: "gpu", kind: "clock", value: 2490.2, unit: "MHz", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-core-clock" },
  { id: "nvidia:0:memory-clock", label: "GPU 0 显存频率", category: "gpu", kind: "clock", value: 10501, unit: "MHz", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-memory-clock" },
  { id: "nvidia:0:power", label: "GPU 0 功耗", category: "gpu", kind: "power", value: 39.1, unit: "W", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-power" },
  { id: "nvidia:0:temperature", label: "GPU 0 温度", category: "gpu", kind: "temperature", value: 40, unit: "°C", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-temperature" },
];

describe("system metrics payload", () => {
  it("accepts and normalizes the local monitoring response", () => {
    expect(parseSystemMetrics({ cpu: 12.7, gpu: 101, memory: 76.4, disk: -2, temperatures: { cpu: 54.24, gpu: 40, memory: null, disk: null }, sensors, sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1787230819075 })).toEqual({
      cpu: 13,
      gpu: 100,
      memory: 76,
      disk: 0,
      temperatures: { cpu: 54.2, gpu: 40, memory: null, disk: null },
      sensors: [
        { ...sensors[0], value: 12.7 },
        ...sensors.slice(1),
      ],
      sources: { hardwareMonitor: null, hwinfo: false, nvidia: true },
      sampledAt: 1787230819075,
    });
  });

  it("retains two decimal places for voltage readings", () => {
    const voltage = { id: "hardware-monitor:web:/lpc/it8613e/0/voltage/0", label: "CPU 核心电压", category: "cpu", kind: "voltage", value: 1.236, unit: "V", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "cpu-voltage" };
    const parsed = parseSystemMetrics({ cpu: 1, gpu: 2, memory: 3, disk: 4, temperatures: { cpu: null, gpu: null, memory: null, disk: null }, sensors: [...sensors, voltage], sources: { hardwareMonitor: "LibreHardwareMonitor", hwinfo: false, nvidia: true }, sampledAt: 1 });

    expect(parsed?.sensors.find((sensor) => sensor.id === voltage.id)?.value).toBe(1.24);
  });

  it("rejects incomplete or malformed monitoring responses", () => {
    expect(parseSystemMetrics({ cpu: 1, gpu: 2, memory: 3, sampledAt: 1 })).toBeNull();
    expect(parseSystemMetrics({ cpu: "1", gpu: 2, memory: 3, disk: 4, temperatures: { cpu: null, gpu: null, memory: null, disk: null }, sensors, sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1 })).toBeNull();
    expect(parseSystemMetrics({ cpu: 1, gpu: 2, memory: 3, disk: 4, temperatures: { cpu: 151, gpu: null, memory: null, disk: null }, sensors, sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1 })).toBeNull();
    expect(parseSystemMetrics({ cpu: 1, gpu: 2, memory: 3, disk: 4, temperatures: { cpu: null, gpu: null, memory: null, disk: null }, sensors: [{ ...sensors[0], unit: "MHz" }], sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1 })).toBeNull();
  });

  it("accepts HWiNFO readings and reports the connected source", () => {
    const hwinfoSensors = [
      { id: "hwinfo:0:1", label: "CPU (Tctl/Tdie)", category: "cpu", kind: "temperature", value: 76.2, unit: "°C", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-temperature" },
      { id: "hwinfo:2:3", label: "System", category: "motherboard", kind: "temperature", value: 40, unit: "°C", source: "hwinfo", sourceLabel: "HWiNFO", role: "motherboard-temperature" },
      { id: "hwinfo:3:4", label: "Drive Temperature", category: "storage", kind: "temperature", value: 45, unit: "°C", source: "hwinfo", sourceLabel: "HWiNFO", role: "storage-temperature" },
      { id: "hwinfo:3:5", label: "磁盘剩余寿命", category: "storage", kind: "load", value: 100, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: "storage-health" },
      { id: "hwinfo:4:5", label: "DIMM Temperature", category: "memory", kind: "temperature", value: 37, unit: "°C", source: "hwinfo", sourceLabel: "HWiNFO", role: "memory-temperature" },
    ];
    const parsed = parseSystemMetrics({ cpu: 13, gpu: 5, memory: 40, disk: 4, temperatures: { cpu: 76.2, gpu: null, memory: 37, disk: 45 }, sensors: hwinfoSensors, sources: { hardwareMonitor: null, hwinfo: true, nvidia: false }, sampledAt: 1 });

    expect(parsed?.sources).toEqual({ hardwareMonitor: null, hwinfo: true, nvidia: false });
    expect(defaultSystemSensorSelection(parsed!.sensors).summary).toContain("hwinfo:3:5");
    const selectedTemperatures = defaultSystemSensorSelection(parsed!.sensors).temperatures;
    const expectedTemperatures = hwinfoSensors.filter((sensor) => sensor.kind === "temperature").map((sensor) => sensor.id);
    expect(selectedTemperatures).toHaveLength(expectedTemperatures.length);
    expect(selectedTemperatures).toEqual(expect.arrayContaining(expectedTemperatures));
  });

  it("accepts LibreHardwareMonitor web readings for the non-GPU temperature cards", () => {
    const libreSensors = [
      { id: "hardware-monitor:web:/amdcpu/0/temperature/2", label: "Core (Tctl/Tdie)", category: "cpu", kind: "temperature", value: 76.2, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "cpu-temperature" },
      { id: "hardware-monitor:web:/lpc/it8613e/0/temperature/1", label: "System", category: "motherboard", kind: "temperature", value: 40, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "motherboard-temperature" },
      { id: "hardware-monitor:web:/nvme/0/temperature/0", label: "Drive Temperature", category: "storage", kind: "temperature", value: 45, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "storage-temperature" },
      { id: "hardware-monitor:web:/nvme/0/level/20", label: "磁盘剩余寿命", category: "storage", kind: "load", value: 100, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "storage-health" },
      { id: "hardware-monitor:web:/memory/dimm/1/temperature/0", label: "DIMM Temperature", category: "memory", kind: "temperature", value: 37, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "memory-temperature" },
    ];
    const parsed = parseSystemMetrics({ cpu: 13, gpu: 5, memory: 40, disk: 4, temperatures: { cpu: 76.2, gpu: null, memory: 37, disk: 45 }, sensors: libreSensors, sources: { hardwareMonitor: "LibreHardwareMonitor", hwinfo: false, nvidia: false }, sampledAt: 1 });

    expect(parsed?.sources).toEqual({ hardwareMonitor: "LibreHardwareMonitor", hwinfo: false, nvidia: false });
    expect(defaultSystemSensorSelection(parsed!.sensors).summary).toContain("hardware-monitor:web:/nvme/0/level/20");
    const selectedTemperatures = defaultSystemSensorSelection(parsed!.sensors).temperatures;
    const expectedTemperatures = libreSensors.filter((sensor) => sensor.kind === "temperature").map((sensor) => sensor.id);
    expect(selectedTemperatures).toHaveLength(expectedTemperatures.length);
    expect(selectedTemperatures).toEqual(expect.arrayContaining(expectedTemperatures));
  });

  it("creates bounded default selections and validates saved choices", () => {
    const parsed = parseSystemMetrics({ cpu: 13, gpu: 5, memory: 40, disk: 4, temperatures: { cpu: null, gpu: 40, memory: null, disk: null }, sensors, sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1 });
    expect(parsed).not.toBeNull();
    expect(defaultSystemSensorSelection(parsed!.sensors)).toEqual({ summary: ["windows:cpu-load", "nvidia:0:core-clock", "nvidia:0:memory-clock", "nvidia:0:power"], temperatures: ["nvidia:0:temperature"] });
    expect(normalizeSystemSensorSelection({ summary: Array(12).fill("sensor"), temperatures: Array(8).fill("temperature") })).toEqual({ summary: ["sensor"], temperatures: ["temperature"] });
    expect(normalizeSystemSensorSelection({ summary: Array.from({ length: SYSTEM_SENSOR_SUMMARY_LIMIT + 1 }, (_, index) => `summary-${index}`), temperatures: Array.from({ length: SYSTEM_SENSOR_TEMPERATURE_LIMIT + 1 }, (_, index) => `temperature-${index}`) })).toEqual({ summary: Array.from({ length: SYSTEM_SENSOR_SUMMARY_LIMIT }, (_, index) => `summary-${index}`), temperatures: Array.from({ length: SYSTEM_SENSOR_TEMPERATURE_LIMIT }, (_, index) => `temperature-${index}`) });
  });
});
