import { useEffect } from "react";

// Holds the Screen Wake Lock while `active` is true so the mobile screen
// doesn't turn off during a long upload/analysis. Re-acquires the lock
// automatically when the tab becomes visible again (browsers drop it when the
// document is hidden). Silently no-ops on browsers without the API.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined") return;

    const wakeLockApi: any = (navigator as any).wakeLock;
    if (!wakeLockApi || typeof wakeLockApi.request !== "function") return;

    let sentinel: any = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        sentinel = await wakeLockApi.request("screen");
        sentinel?.addEventListener?.("release", () => {
          // The browser released it (e.g. visibility change). We'll re-acquire
          // on the next visibilitychange "visible" event.
          sentinel = null;
        });
      } catch {
        // User denied / unsupported / not allowed in this context. Best-effort.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        sentinel?.release?.();
      } catch {
        // ignore
      }
      sentinel = null;
    };
  }, [active]);
}
