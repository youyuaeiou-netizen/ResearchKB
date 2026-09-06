export type SystemMetricName = "cpu" | "gpu" | "memory" | "disk";

export type SystemMetrics = Record<SystemMetricName, number> & {
  sampledAt: number;
};

const metricNames: SystemMetricName[] = ["cpu", "gpu", "memory", "disk"];

const asPercent = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : null;

export function parseSystemMetrics(payload: unknown): SystemMetrics | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const values = metricNames.map((name) => asPercent(record[name]));
  const sampledAt = typeof record.sampledAt === "number" && Number.isFinite(record.sampledAt) ? record.sampledAt : null;
  if (values.some((value) => value === null) || sampledAt === null) return null;

  return {
    cpu: values[0]!,
    gpu: values[1]!,
    memory: values[2]!,
    disk: values[3]!,
    sampledAt,
  };
}
