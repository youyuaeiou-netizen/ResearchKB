import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import startupImageUrl from "../assets/startup/obsui-tv-loading.webp";
import sharkbooBodyUrl from "../assets/startup/sharkboo-body.webp";
import sharkbooBlinkUrl from "../assets/startup/sharkboo-body-blink.webp";

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

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function StartupOverlay({ signals, hidden = false }: { signals: StartupSignals; hidden?: boolean }) {
  const [phase, setPhase] = useState<"booting" | "exiting" | "hidden">("booting");
  const [loadedAssets, setLoadedAssets] = useState(0);
  const startedAtRef = useRef(Date.now());
  const exitingRef = useRef(false);
  const step = useMemo(() => getStartupStep(signals), [signals]);
  const dataReady = isStartupReady(signals);
  const assetsReady = loadedAssets >= 3;
  const markAssetReady = () => setLoadedAssets((count) => Math.min(3, count + 1));

  const beginExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setPhase("exiting");
    window.setTimeout(() => setPhase("hidden"), prefersReducedMotion() ? 80 : 460);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(beginExit, 25_000);
    return () => window.clearTimeout(timeout);
  }, [beginExit]);

  useEffect(() => {
    if (!dataReady || !assetsReady) return;
    const minimumVisibleMs = prefersReducedMotion() ? 120 : 1_300;
    const remaining = Math.max(0, minimumVisibleMs - (Date.now() - startedAtRef.current));
    const timeout = window.setTimeout(beginExit, remaining);
    return () => window.clearTimeout(timeout);
  }, [assetsReady, beginExit, dataReady]);

  useEffect(() => {
    if (!hidden) return;
    // Wallpaper-only mode must suppress the already-mounted overlay. Mark it
    // as finished as well, so restoring the workbench cannot replay the boot
    // animation by starting a fresh overlay lifecycle.
    exitingRef.current = true;
    setPhase("hidden");
  }, [hidden]);

  if (hidden || phase === "hidden") return null;

  return <div className="startup-overlay" data-phase={phase} role="status" aria-live="polite" aria-label={step.label}>
    <div className="startup-stage" style={{ "--startup-card-index": step.cardIndex } as CSSProperties}>
      <img className="startup-image" src={startupImageUrl} alt="" onLoad={markAssetReady} onError={markAssetReady} />
      <div className="startup-sharkboo" aria-hidden="true">
        <img className="startup-sharkboo-body" src={sharkbooBodyUrl} alt="" onLoad={markAssetReady} onError={markAssetReady} />
        <img className="startup-sharkboo-blink" src={sharkbooBlinkUrl} alt="" onLoad={markAssetReady} onError={markAssetReady} />
      </div>
      <span className="startup-card-signal" aria-hidden="true" />
      <div className="startup-live-status" aria-hidden="true"><i />{step.label}</div>
      <span className="startup-power-line" aria-hidden="true" />
    </div>
  </div>;
}
