export type NetworkCounterSample = {
  adapterId: number;
  receivedBytes: number;
  sentBytes: number;
  sampledAt: number;
};

export type NetworkMetrics = {
  adapter: {
    name: string;
    localIpv4: string | null;
    linkSpeed: string | null;
  };
  downloadBytesPerSecond: number | null;
  uploadBytesPerSecond: number | null;
  latency: {
    target: string;
    milliseconds: number | null;
    sampledAt: number | null;
  };
  flClash: {
    running: boolean;
    launchConfigured: boolean;
  };
  sampledAt: number;
};

export type NetworkEgress = {
  ip: string;
  country: string | null;
  countryCode: string | null;
  asn: string | null;
  asName: string | null;
};

export type NetworkEgressState = {
  status: "idle" | "ready" | "unconfigured" | "unavailable";
  checkedAt: number | null;
  data: NetworkEgress | null;
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike => Boolean(value && typeof value === "object" && !Array.isArray(value));
const asNonEmptyString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const asNullableString = (value: unknown) => value === null ? null : asNonEmptyString(value);
const asNonNegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export function calculateTrafficRates(previous: NetworkCounterSample | null, current: NetworkCounterSample) {
  if (!previous || previous.adapterId !== current.adapterId || current.sampledAt <= previous.sampledAt) return null;
  if (current.receivedBytes < previous.receivedBytes || current.sentBytes < previous.sentBytes) return null;

  const elapsedMilliseconds = current.sampledAt - previous.sampledAt;
  return {
    downloadBytesPerSecond: Math.round((current.receivedBytes - previous.receivedBytes) * 1000 / elapsedMilliseconds),
    uploadBytesPerSecond: Math.round((current.sentBytes - previous.sentBytes) * 1000 / elapsedMilliseconds),
  };
}

export function parseLoopbackProxyUrl(value: unknown): string | null {
  const source = asNonEmptyString(value);
  if (!source) return null;

  try {
    const url = new URL(source);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isLoopback = hostname === "127.0.0.1" || hostname === "::1";
    if (url.protocol !== "http:" || !isLoopback || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseNetworkMetrics(payload: unknown): NetworkMetrics | null {
  if (!isRecord(payload) || !isRecord(payload.adapter) || !isRecord(payload.latency) || !isRecord(payload.flClash)) return null;
  const adapterName = asNonEmptyString(payload.adapter.name);
  const localIpv4 = asNullableString(payload.adapter.localIpv4);
  const linkSpeed = asNullableString(payload.adapter.linkSpeed);
  const downloadBytesPerSecond = payload.downloadBytesPerSecond === null ? null : asNonNegativeNumber(payload.downloadBytesPerSecond);
  const uploadBytesPerSecond = payload.uploadBytesPerSecond === null ? null : asNonNegativeNumber(payload.uploadBytesPerSecond);
  const latencyTarget = asNonEmptyString(payload.latency.target);
  const latencyMilliseconds = payload.latency.milliseconds === null ? null : asNonNegativeNumber(payload.latency.milliseconds);
  const latencySampledAt = payload.latency.sampledAt === null ? null : asNonNegativeNumber(payload.latency.sampledAt);
  const sampledAt = asNonNegativeNumber(payload.sampledAt);
  if (!adapterName || localIpv4 === null && payload.adapter.localIpv4 !== null || linkSpeed === null && payload.adapter.linkSpeed !== null ||
    downloadBytesPerSecond === null && payload.downloadBytesPerSecond !== null || uploadBytesPerSecond === null && payload.uploadBytesPerSecond !== null ||
    !latencyTarget || latencyMilliseconds === null && payload.latency.milliseconds !== null || latencySampledAt === null && payload.latency.sampledAt !== null ||
    sampledAt === null || typeof payload.flClash.running !== "boolean" || typeof payload.flClash.launchConfigured !== "boolean") return null;

  return {
    adapter: { name: adapterName, localIpv4, linkSpeed },
    downloadBytesPerSecond,
    uploadBytesPerSecond,
    latency: { target: latencyTarget, milliseconds: latencyMilliseconds, sampledAt: latencySampledAt },
    flClash: { running: payload.flClash.running, launchConfigured: payload.flClash.launchConfigured },
    sampledAt,
  };
}

export function parseNetworkEgressState(payload: unknown): NetworkEgressState | null {
  if (!isRecord(payload) || !["idle", "ready", "unconfigured", "unavailable"].includes(String(payload.status))) return null;
  const status = payload.status as NetworkEgressState["status"];
  const checkedAt = payload.checkedAt === null ? null : asNonNegativeNumber(payload.checkedAt);
  if (checkedAt === null && payload.checkedAt !== null) return null;
  if (status !== "ready") return payload.data === null ? { status, checkedAt, data: null } : null;
  if (!isRecord(payload.data)) return null;

  const ip = asNonEmptyString(payload.data.ip);
  const country = asNullableString(payload.data.country);
  const countryCode = asNullableString(payload.data.countryCode);
  const asn = asNullableString(payload.data.asn);
  const asName = asNullableString(payload.data.asName);
  if (!ip || country === null && payload.data.country !== null || countryCode === null && payload.data.countryCode !== null ||
    asn === null && payload.data.asn !== null || asName === null && payload.data.asName !== null || checkedAt === null) return null;

  return { status, checkedAt, data: { ip, country, countryCode, asn, asName } };
}
