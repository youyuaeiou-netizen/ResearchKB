import { parseCodexUsage } from "../src/codex-usage";

describe("Codex usage payload", () => {
  it("normalizes both Codex rate-limit windows", () => {
    expect(parseCodexUsage({
      windows: [
        { usedPercent: 13.4, windowMinutes: 300, resetsAt: 1_787_230_819 },
        { usedPercent: 68.4, windowMinutes: 10080, resetsAt: 1_787_230_819 },
      ],
      sampledAt: 1_787_000_000_000,
    })).toEqual({
      windows: [
        { usedPercent: 13, remainingPercent: 87, windowMinutes: 300, resetsAt: 1_787_230_819_000 },
        { usedPercent: 68, remainingPercent: 32, windowMinutes: 10080, resetsAt: 1_787_230_819_000 },
      ],
      sampledAt: 1_787_000_000_000,
    });
  });

  it("accepts the legacy single-window response while the server rolls forward", () => {
    expect(parseCodexUsage({
      usedPercent: 68.4,
      windowMinutes: 10080,
      resetsAt: 1_787_230_819,
      sampledAt: 1_787_000_000_000,
    })).toEqual({
      windows: [{ usedPercent: 68, remainingPercent: 32, windowMinutes: 10080, resetsAt: 1_787_230_819_000 }],
      sampledAt: 1_787_000_000_000,
    });
  });

  it("rejects incomplete or malformed usage responses", () => {
    expect(parseCodexUsage({ usedPercent: 20, windowMinutes: 10080, resetsAt: 1_787_230_819 })).toBeNull();
    expect(parseCodexUsage({ usedPercent: "20", windowMinutes: 10080, resetsAt: 1_787_230_819, sampledAt: 1_787_000_000 })).toBeNull();
  });
});
