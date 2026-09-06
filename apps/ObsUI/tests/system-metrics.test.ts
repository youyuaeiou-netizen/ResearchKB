import { parseSystemMetrics } from "../src/system-metrics";

describe("system metrics payload", () => {
  it("accepts and normalizes the local monitoring response", () => {
    expect(parseSystemMetrics({ cpu: 12.7, gpu: 101, memory: 76.4, disk: -2, sampledAt: 1787230819075 })).toEqual({
      cpu: 13,
      gpu: 100,
      memory: 76,
      disk: 0,
      sampledAt: 1787230819075,
    });
  });

  it("rejects incomplete or malformed monitoring responses", () => {
    expect(parseSystemMetrics({ cpu: 1, gpu: 2, memory: 3, sampledAt: 1 })).toBeNull();
    expect(parseSystemMetrics({ cpu: "1", gpu: 2, memory: 3, disk: 4, sampledAt: 1 })).toBeNull();
  });
});
