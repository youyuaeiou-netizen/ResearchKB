import { describe, expect, it } from "vitest";
import { parseDeviceProfile } from "../src/device-profile";

describe("device profile payload", () => {
  it("accepts the hardware fields shown in the local device archive", () => {
    const profile = parseDeviceProfile({
      sampledAt: 1787230819075,
      os: { name: "Windows 11 专业版 64 位", version: "10.0.26100", architecture: "64-bit" },
      cpu: { name: "12th Gen Intel(R) Core(TM) i5-12500H", cores: 12, threads: 16, clockMHz: 4_500, process: null },
      gpus: [{ name: "NVIDIA GeForce RTX 3060 Laptop GPU", vendor: "NVIDIA", memoryBytes: 6 * 1024 ** 3, memoryType: null, driverVersion: "576.52" }],
      motherboard: { manufacturer: "Notebook", model: "Model A", chipset: null },
      memory: {
        totalBytes: 16 * 1024 ** 3,
        speedMHz: 4_800,
        channels: 2,
        modules: [{ capacityBytes: 8 * 1024 ** 3, speedMHz: 4_800, manufacturer: "Vendor", partNumber: "Part", locator: "Slot 1", memoryType: "DDR5" }],
      },
      storage: [{ model: "NVMe SSD", sizeBytes: 512 * 1024 ** 3, type: "SSD", interfaceType: "NVMe" }],
      displays: [{ name: "Internal Display", width: 1920, height: 1080, refreshRateHz: 144, sizeInches: null }],
    });

    expect(profile?.cpu.cores).toBe(12);
    expect(profile?.gpus[0]?.memoryBytes).toBe(6 * 1024 ** 3);
    expect(profile?.memory.modules[0]?.memoryType).toBe("DDR5");
    expect(profile?.displays[0]?.width).toBe(1920);
  });

  it("drops malformed list items without inventing missing device data", () => {
    const profile = parseDeviceProfile({
      sampledAt: 1,
      os: { name: "Windows", version: null, architecture: null },
      cpu: { name: null, cores: null, threads: null, clockMHz: null, process: null },
      gpus: [{ name: "", memoryBytes: 6 * 1024 ** 3 }],
      motherboard: { manufacturer: null, model: null, chipset: null },
      memory: { totalBytes: null, speedMHz: null, channels: null, modules: [{ locator: "Slot 1" }] },
      storage: [{ model: "SSD", sizeBytes: null, type: null, interfaceType: null }],
      displays: [],
    });

    expect(profile?.gpus).toEqual([]);
    expect(profile?.memory.modules).toHaveLength(1);
    expect(profile?.memory.modules[0]).toMatchObject({ locator: "Slot 1" });
  });

  it("rejects a response without the required device groups", () => {
    expect(parseDeviceProfile({ sampledAt: 1, os: {}, cpu: {}, memory: {} })).toBeNull();
    expect(parseDeviceProfile(null)).toBeNull();
  });
});
