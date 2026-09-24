import { describe, expect, it } from "vitest";
import { getStartupStep, isStartupReady, type StartupSignals } from "../src/startup";

const readySignals: StartupSignals = {
  storageReady: true,
  weatherStatus: "ready",
  systemStatus: "ready",
  networkStatus: "ready",
  egressLoading: false,
  egressStatus: "ready",
  localModelsLoading: false,
  codexStatus: "ready",
  companionStatus: "ready",
};

describe("startup gate", () => {
  it("waits for local first-load signals without blocking on proxy egress", () => {
    expect(isStartupReady(readySignals)).toBe(true);
    expect(isStartupReady({ ...readySignals, storageReady: false })).toBe(false);
    expect(isStartupReady({ ...readySignals, weatherStatus: "loading" })).toBe(false);
    expect(isStartupReady({ ...readySignals, egressLoading: true, egressStatus: "idle" })).toBe(true);
    expect(isStartupReady({ ...readySignals, localModelsLoading: true })).toBe(false);
    expect(isStartupReady({ ...readySignals, companionStatus: "loading" })).toBe(false);
  });

  it("reports the subsystem currently being prepared", () => {
    expect(getStartupStep({ ...readySignals, storageReady: false })).toEqual({ label: "正在读取本地资料…", cardIndex: 1 });
    expect(getStartupStep({ ...readySignals, weatherStatus: "locating" })).toEqual({ label: "正在同步天气…", cardIndex: 0 });
    expect(getStartupStep({ ...readySignals, systemStatus: "loading" })).toEqual({ label: "正在连接系统监控…", cardIndex: 2 });
    expect(getStartupStep({ ...readySignals, localModelsLoading: true })).toEqual({ label: "正在接入工作台…", cardIndex: 3 });
    expect(getStartupStep({ ...readySignals, companionStatus: "loading" })).toEqual({ label: "正在连接文献服务…", cardIndex: 3 });
    expect(getStartupStep(readySignals)).toEqual({ label: "工作台已就绪", cardIndex: 3 });
  });
});
