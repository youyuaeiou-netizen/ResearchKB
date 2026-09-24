import { startRefreshLoop, startVisibleRefreshLoop } from "../src/refresh-loop";

describe("refresh loop", () => {
  afterEach(() => vi.useRealTimers());

  it("runs immediately and schedules the next read after the current read settles", async () => {
    vi.useFakeTimers();
    let finishFirst: (() => void) | undefined;
    const firstRead = new Promise<void>((resolve) => { finishFirst = resolve; });
    const refresh = vi.fn()
      .mockImplementationOnce(() => firstRead)
      .mockResolvedValue(undefined);
    const stop = startRefreshLoop(refresh, 60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    finishFirst?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(59_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

    stop();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("retries sooner when a read reports that the source is unavailable", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(undefined);
    const stop = startRefreshLoop(refresh, 60_000, 5_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    vi.advanceTimersByTime(4_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

    stop();
  });

  it("does not poll while the document is hidden and refreshes when it becomes visible", async () => {
    vi.useFakeTimers();
    const descriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      const refresh = vi.fn().mockResolvedValue(true);
      const stop = startVisibleRefreshLoop(refresh, 60_000);

      vi.advanceTimersByTime(60_000);
      expect(refresh).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(refresh).toHaveBeenCalledTimes(1);

      stop();
    } finally {
      if (descriptor) Object.defineProperty(document, "visibilityState", descriptor);
      else Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    }
  });
});
