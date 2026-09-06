import { parseCodexUsage } from "../src/codex-usage";

describe("Codex usage payload", () => {
  it("normalizes the local Codex weekly usage response", () => {
    expect(parseCodexUsage({
      usedPercent: 68.4,
      windowMinutes: 10080,
      resetsAt: 1_787_230_819,
      sampledAt: 1_787_000_000_000,
    })).toEqual({
      usedPercent: 68,
      remainingPercent: 32,
      windowMinutes: 10080,
      resetsAt: 1_787_230_819_000,
      sampledAt: 1_787_000_000_000,
    });
  });

  it("rejects incomplete or malformed usage responses", () => {
    expect(parseCodexUsage({ usedPercent: 20, windowMinutes: 10080, resetsAt: 1_787_230_819 })).toBeNull();
    expect(parseCodexUsage({ usedPercent: "20", windowMinutes: 10080, resetsAt: 1_787_230_819, sampledAt: 1_787_000_000 })).toBeNull();
  });
});
