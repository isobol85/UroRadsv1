import { useState, useEffect, useCallback, useRef } from "react";

type ViewMode = "image" | "read";

export function useUrlMode(wouterLocation: string, defaultMode: ViewMode = "image"): [ViewMode, (mode: ViewMode) => void] {
  const getUrlMode = useCallback((): ViewMode => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get("view");
    return viewParam === "read" ? "read" : "image";
  }, []);

  const [mode, setModeState] = useState<ViewMode>(() => {
    const urlMode = getUrlMode();
    if (urlMode === "read") {
      return "read";
    }
    const sessionMode = sessionStorage.getItem('urorads_open_in_read_mode');
    if (sessionMode) {
      sessionStorage.removeItem('urorads_open_in_read_mode');
      return "read";
    }
    return defaultMode;
  });

  const prevLocationRef = useRef(wouterLocation);

  const setMode = useCallback((newMode: ViewMode) => {
    setModeState(newMode);
    
    const url = new URL(window.location.href);
    if (newMode === "read") {
      url.searchParams.set("view", "read");
    } else {
      url.searchParams.delete("view");
    }
    
    if (url.href !== window.location.href) {
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (wouterLocation !== prevLocationRef.current) {
      prevLocationRef.current = wouterLocation;
      const urlMode = getUrlMode();
      setModeState(urlMode);
    }
  }, [wouterLocation, getUrlMode]);

  useEffect(() => {
    const handlePopState = () => {
      const urlMode = getUrlMode();
      setModeState(urlMode);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getUrlMode]);

  useEffect(() => {
    const handleOpenChat = () => {
      setModeState("read");
      const url = new URL(window.location.href);
      url.searchParams.set("view", "read");
      if (url.href !== window.location.href) {
        window.history.replaceState({}, "", url.toString());
      }
    };
    
    window.addEventListener('urorads-open-chat', handleOpenChat as EventListener);
    return () => window.removeEventListener('urorads-open-chat', handleOpenChat as EventListener);
  }, []);

  return [mode, setMode];
}
