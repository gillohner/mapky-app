import { useSyncExternalStore } from "react";

/**
 * Track `navigator.onLine`. Browser support is universal but the flag
 * is best-effort — it reflects connectivity *to the local router*, not
 * reachability of the actual backends. Use it as a hint for UI; treat
 * fetch errors as the source of truth for actual failure.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
