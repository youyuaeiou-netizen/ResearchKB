export type DeviceMemoryModule = {
  capacityBytes: number | null;
  speedMHz: number | null;
  manufacturer: string | null;
  partNumber: string | null;
  locator: string | null;
  memoryType: string | null;
};

export type DeviceGpu = {
  name: string;
  vendor: string | null;
  memoryBytes: number | null;
  memoryType: string | null;
  driverVersion: string | null;
};

export type DeviceStorage = {
  model: string;
  deviceId?: string | null;
  sizeBytes: number | null;
  type: string | null;
  interfaceType: string | null;
};

export type DeviceDisplay = {
  name: string;
  width: number | null;
  height: number | null;
  refreshRateHz: number | null;
  sizeInches: number | null;
};

export type DeviceProfile = {
  sampledAt: number;
  os: {
    name: string | null;
    version: string | null;
    architecture: string | null;
  };
  cpu: {
    name: string | null;
    cores: number | null;
    threads: number | null;
    clockMHz: number | null;
    process: string | null;
  };
  gpus: DeviceGpu[];
  motherboard: {
    manufacturer: string | null;
    model: string | null;
    chipset: string | null;
  };
  memory: {
    totalBytes: number | null;
    speedMHz: number | null;
    channels: number | null;
    modules: DeviceMemoryModule[];
  };
  storage: DeviceStorage[];
  displays: DeviceDisplay[];
};

const maxTextLength = 240;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readText(value: unknown, maximum = maxTextLength): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

function readNumber(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function readInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  const number = readNumber(value, minimum, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 32) : [];
}

function parseMemoryModule(value: unknown): DeviceMemoryModule | null {
  const record = asRecord(value);
  if (!record) return null;
  const module = {
    capacityBytes: readNumber(record.capacityBytes, 0, 2 ** 60),
    speedMHz: readNumber(record.speedMHz, 0, 20_000),
    manufacturer: readText(record.manufacturer, 120),
    partNumber: readText(record.partNumber, 160),
    locator: readText(record.locator, 80),
    memoryType: readText(record.memoryType, 40),
  };
  return Object.values(module).some((item) => item !== null) ? module : null;
}

function parseGpu(value: unknown): DeviceGpu | null {
  const record = asRecord(value);
  const name = record ? readText(record.name) : null;
  if (!name) return null;
  return {
    name,
    vendor: readText(record?.vendor, 80),
    memoryBytes: readNumber(record?.memoryBytes, 0, 2 ** 60),
    memoryType: readText(record?.memoryType, 40),
    driverVersion: readText(record?.driverVersion, 80),
  };
}

function parseStorage(value: unknown): DeviceStorage | null {
  const record = asRecord(value);
  const model = record ? readText(record.model) : null;
  if (!model) return null;
  return {
    model,
    deviceId: readText(record?.deviceId, 120),
    sizeBytes: readNumber(record?.sizeBytes, 0, 2 ** 60),
    type: readText(record?.type, 80),
    interfaceType: readText(record?.interfaceType, 80),
  };
}

function parseDisplay(value: unknown): DeviceDisplay | null {
  const record = asRecord(value);
  const name = record ? readText(record.name) : null;
  if (!name) return null;
  return {
    name,
    width: readInteger(record?.width, 1, 32_000),
    height: readInteger(record?.height, 1, 32_000),
    refreshRateHz: readNumber(record?.refreshRateHz, 1, 1_000),
    sizeInches: readNumber(record?.sizeInches, 1, 200),
  };
}

export function parseDeviceProfile(payload: unknown): DeviceProfile | null {
  const record = asRecord(payload);
  if (!record) return null;
  const osRecord = asRecord(record.os);
  const cpuRecord = asRecord(record.cpu);
  const motherboardRecord = asRecord(record.motherboard);
  const memoryRecord = asRecord(record.memory);
  const sampledAt = readNumber(record.sampledAt, 0, Number.MAX_SAFE_INTEGER);
  if (!osRecord || !cpuRecord || !motherboardRecord || !memoryRecord || sampledAt === null) return null;

  return {
    sampledAt,
    os: {
      name: readText(osRecord.name),
      version: readText(osRecord.version, 100),
      architecture: readText(osRecord.architecture, 40),
    },
    cpu: {
      name: readText(cpuRecord.name),
      cores: readInteger(cpuRecord.cores, 1, 512),
      threads: readInteger(cpuRecord.threads, 1, 1_024),
      clockMHz: readNumber(cpuRecord.clockMHz, 1, 20_000),
      process: readText(cpuRecord.process, 40),
    },
    gpus: readArray(record.gpus).map(parseGpu).filter((gpu): gpu is DeviceGpu => gpu !== null),
    motherboard: {
      manufacturer: readText(motherboardRecord.manufacturer, 120),
      model: readText(motherboardRecord.model),
      chipset: readText(motherboardRecord.chipset, 120),
    },
    memory: {
      totalBytes: readNumber(memoryRecord.totalBytes, 0, 2 ** 60),
      speedMHz: readNumber(memoryRecord.speedMHz, 0, 20_000),
      channels: readInteger(memoryRecord.channels, 1, 16),
      modules: readArray(memoryRecord.modules).map(parseMemoryModule).filter((module): module is DeviceMemoryModule => module !== null),
    },
    storage: readArray(record.storage).map(parseStorage).filter((disk): disk is DeviceStorage => disk !== null),
    displays: readArray(record.displays).map(parseDisplay).filter((display): display is DeviceDisplay => display !== null),
  };
}
