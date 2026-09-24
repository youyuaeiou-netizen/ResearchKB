import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import startupBackdropUrl from "../assets/startup/zzz-reference-background.png";
import startupMarkUrl from "../assets/startup/startup-fragment-emblem.png";

export type StartupSignals = {
  storageReady: boolean;
  weatherStatus: string;
  systemStatus: string;
  networkStatus: string;
  egressLoading: boolean;
  egressStatus: string;
  localModelsLoading: boolean;
  codexStatus: string;
  companionStatus: string;
};

type StartupStep = {
  label: string;
  cardIndex: number;
};

const startupCheckCount = 7;

const isPending = (status: string) => status === "loading" || status === "locating";

export function isStartupReady(signals: StartupSignals) {
  return signals.storageReady
    && !isPending(signals.weatherStatus)
    && !isPending(signals.systemStatus)
    && !isPending(signals.networkStatus)
    && !signals.localModelsLoading
    && !isPending(signals.codexStatus)
    && !isPending(signals.companionStatus);
}

export function getStartupStep(signals: StartupSignals): StartupStep {
  if (!signals.storageReady) return { label: "正在读取本地资料…", cardIndex: 1 };
  if (isPending(signals.weatherStatus)) return { label: "正在同步天气…", cardIndex: 0 };
  if (isPending(signals.systemStatus)) return { label: "正在连接系统监控…", cardIndex: 2 };
  if (isPending(signals.networkStatus)) {
    return { label: "正在检测本机网络…", cardIndex: 2 };
  }
  if (signals.localModelsLoading || isPending(signals.codexStatus)) {
    return { label: "正在接入工作台…", cardIndex: 3 };
  }
  if (isPending(signals.companionStatus)) return { label: "正在连接文献服务…", cardIndex: 3 };
  return { label: "工作台已就绪", cardIndex: 3 };
}

function getResolvedStartupChecks(signals: StartupSignals) {
  return [
    signals.storageReady,
    !isPending(signals.weatherStatus),
    !isPending(signals.systemStatus),
    !isPending(signals.networkStatus),
    !signals.localModelsLoading,
    !isPending(signals.codexStatus),
    !isPending(signals.companionStatus),
  ].filter(Boolean).length;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function StartupOverlay({ signals, hidden = false }: { signals: StartupSignals; hidden?: boolean }) {
  const [phase, setPhase] = useState<"booting" | "ready" | "exiting" | "hidden">("booting");
  const [loadedAssets, setLoadedAssets] = useState(0);
  const startedAtRef = useRef(Date.now());
  const exitingRef = useRef(false);
  const step = useMemo(() => getStartupStep(signals), [signals]);
  const resolvedChecks = getResolvedStartupChecks(signals);
  const progress = (resolvedChecks / startupCheckCount) * 100;
  const progressPercent = Math.round(progress);
  const dataReady = isStartupReady(signals);
  const assetsReady = loadedAssets >= 2;
  const markAssetReady = () => setLoadedAssets((count) => Math.min(2, count + 1));

  const beginExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setPhase("exiting");
    window.setTimeout(() => setPhase("hidden"), prefersReducedMotion() ? 80 : 460);
  }, []);

  useEffect(() => {
    if (phase !== "booting") return;
    const timeout = window.setTimeout(() => setPhase("ready"), 25_000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "booting" || !dataReady || !assetsReady) return;
    const minimumVisibleMs = prefersReducedMotion() ? 120 : 1_300;
    const remaining = Math.max(0, minimumVisibleMs - (Date.now() - startedAtRef.current));
    const timeout = window.setTimeout(() => setPhase("ready"), remaining);
    return () => window.clearTimeout(timeout);
  }, [assetsReady, dataReady, phase]);

  useEffect(() => {
    if (!hidden) return;
    // Wallpaper-only mode must suppress the already-mounted overlay. Mark it
    // as finished as well, so restoring the workbench cannot replay the boot
    // animation by starting a fresh overlay lifecycle.
    exitingRef.current = true;
    setPhase("hidden");
  }, [hidden]);

  if (hidden || phase === "hidden") return null;

  return <div className="startup-overlay" data-phase={phase}>
    <img className="startup-backdrop" src={startupBackdropUrl} alt="" aria-hidden="true" onLoad={markAssetReady} onError={markAssetReady} />
    <div className="startup-stage">
      <div className="startup-backdrop-shade" aria-hidden="true" />
      <div className="startup-screen">
        <div className="startup-mark" aria-hidden="true">
          <img className="startup-mark-fragment startup-mark-fragment-a" src={startupMarkUrl} alt="" onLoad={markAssetReady} onError={markAssetReady} />
          <img className="startup-mark-fragment startup-mark-fragment-b" src={startupMarkUrl} alt="" />
          <img className="startup-mark-fragment startup-mark-fragment-c" src={startupMarkUrl} alt="" />
        </div>
        <div className="startup-progress">
          <div className="startup-progress-heading">
            <span className="startup-status" role="status" aria-live="polite">{step.label}</span>
            <span className="startup-progress-count">{progressPercent}%</span>
          </div>
          <div className="startup-progress-track" role="progressbar" aria-label="启动检查进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            <i style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        {phase === "ready" && <button className="startup-enter-button" type="button" onClick={beginExit}>确认进入</button>}
      </div>
    </div>
  </div>;
}
