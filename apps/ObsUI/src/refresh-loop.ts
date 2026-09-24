export function startRefreshLoop(refresh: () => Promise<void | boolean> | void | boolean, intervalMs: number, retryIntervalMs = intervalMs): () => void {
  let stopped = false;
  let timer: number | null = null;

  const schedule = (delayMs = intervalMs) => {
    if (stopped) return;
    timer = window.setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const run = async () => {
    let succeeded = true;
    try {
      succeeded = (await refresh()) !== false;
    } catch {
      // The refresh function owns its visible error state; keep the loop alive.
      succeeded = false;
    } finally {
      schedule(succeeded ? intervalMs : retryIntervalMs);
    }
  };

  void run();

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
  };
}

export function startVisibleRefreshLoop(refresh: () => Promise<void | boolean> | void | boolean, intervalMs: number, retryIntervalMs = intervalMs): () => void {
  const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const refreshWhenVisible = () => isVisible() ? refresh() : undefined;
  const stopRefreshLoop = startRefreshLoop(refreshWhenVisible, intervalMs, retryIntervalMs);
  const onVisible = () => {
    if (isVisible()) void refreshWhenVisible();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  if (typeof window !== "undefined") {
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
  }

  return () => {
    stopRefreshLoop();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    }
  };
}
