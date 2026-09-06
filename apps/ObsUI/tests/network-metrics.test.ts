import {
  calculateTrafficRates,
  parseLoopbackProxyUrl,
  parseNetworkEgressState,
  parseNetworkMetrics,
} from "../src/network-metrics";

describe("network metric helpers", () => {
  it("calculates traffic rates only from a continuous adapter sample", () => {
    expect(calculateTrafficRates(null, { adapterId: 8, receivedBytes: 1200, sentBytes: 500, sampledAt: 3000 })).toBeNull();
    expect(calculateTrafficRates(
      { adapterId: 8, receivedBytes: 200, sentBytes: 100, sampledAt: 1000 },
      { adapterId: 8, receivedBytes: 1200, sentBytes: 500, sampledAt: 3000 },
    )).toEqual({ downloadBytesPerSecond: 500, uploadBytesPerSecond: 200 });
    expect(calculateTrafficRates(
      { adapterId: 8, receivedBytes: 1200, sentBytes: 500, sampledAt: 3000 },
      { adapterId: 8, receivedBytes: 20, sentBytes: 5, sampledAt: 5000 },
    )).toBeNull();
  });

  it("allows only an explicit loopback HTTP proxy", () => {
    expect(parseLoopbackProxyUrl("http://127.0.0.1:7890")).toBe("http://127.0.0.1:7890/");
    expect(parseLoopbackProxyUrl("http://[::1]:7890")).toBe("http://[::1]:7890/");
    expect(parseLoopbackProxyUrl("http://localhost:7890")).toBeNull();
    expect(parseLoopbackProxyUrl("https://127.0.0.1:7890")).toBeNull();
    expect(parseLoopbackProxyUrl("http://192.168.1.2:7890")).toBeNull();
    expect(parseLoopbackProxyUrl("http://127.0.0.1:7890/other")).toBeNull();
  });

  it("accepts local network data but rejects malformed fields", () => {
    const payload = {
      adapter: { name: "WLAN", localIpv4: "192.168.1.28", linkSpeed: "817 Mbps" },
      downloadBytesPerSecond: null,
      uploadBytesPerSecond: 3300.8,
      latency: { target: "1.1.1.1:443", milliseconds: 24.2, sampledAt: 1787230819075 },
      flClash: { running: true, launchConfigured: false },
      sampledAt: 1787230819120,
    };
    expect(parseNetworkMetrics(payload)).toEqual({
      ...payload,
      uploadBytesPerSecond: 3301,
      latency: { ...payload.latency, milliseconds: 24 },
    });
    expect(parseNetworkMetrics({ ...payload, latency: { ...payload.latency, target: "" } })).toBeNull();
  });

  it("filters egress payloads down to the supported IPinfo fields", () => {
    expect(parseNetworkEgressState({
      status: "ready",
      checkedAt: 1787230819120,
      data: { ip: "203.0.113.42", country: "United States", countryCode: "US", asn: "AS64500", asName: "Example Transit", ignored: "value" },
    })).toEqual({
      status: "ready",
      checkedAt: 1787230819120,
      data: { ip: "203.0.113.42", country: "United States", countryCode: "US", asn: "AS64500", asName: "Example Transit" },
    });
    expect(parseNetworkEgressState({ status: "ready", checkedAt: 1, data: { ip: "203.0.113.42" } })).toBeNull();
    expect(parseNetworkEgressState({ status: "unconfigured", checkedAt: null, data: null })).toEqual({ status: "unconfigured", checkedAt: null, data: null });
  });
});
