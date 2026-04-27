import { useEffect, useRef, useState } from "react";

export type GeolocationStatus =
  | "idle"
  | "prompt"
  | "loading"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

export interface UserLocation {
  lat: number;
  lon: number;
  /** Best estimate of horizontal accuracy in metres. */
  accuracy?: number;
  /** Unix ms when the fix was acquired. */
  timestamp: number;
}

interface UseUserLocationResult {
  location: UserLocation | null;
  status: GeolocationStatus;
  error: string | null;
  /** Trigger a fresh fix. Call this on user-initiated actions only. */
  request: () => Promise<UserLocation | null>;
  /** Clear cached fix and reset status to idle. */
  clear: () => void;
}

/**
 * Browser geolocation as a hook. Caches the last fix in module memory so
 * navigating between pages doesn't re-prompt or re-fetch.
 *
 * `request()` is the only side-effect — call it on user gesture (click).
 * Reading `location` is free.
 */
let cached: UserLocation | null = null;
let cachedStatus: GeolocationStatus = "idle";

export function useUserLocation(): UseUserLocationResult {
  const [location, setLocation] = useState<UserLocation | null>(cached);
  const [status, setStatus] = useState<GeolocationStatus>(cachedStatus);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<UserLocation | null> | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      cachedStatus = "unsupported";
    }
  }, []);

  const request = async (): Promise<UserLocation | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return null;
    }
    if (inFlight.current) return inFlight.current;
    setStatus("loading");
    setError(null);

    inFlight.current = new Promise<UserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: UserLocation = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          cached = loc;
          cachedStatus = "granted";
          setLocation(loc);
          setStatus("granted");
          resolve(loc);
        },
        (err) => {
          // PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3
          const denied = err.code === err.PERMISSION_DENIED;
          cachedStatus = denied ? "denied" : "error";
          setStatus(denied ? "denied" : "error");
          setError(err.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    }).finally(() => {
      inFlight.current = null;
    });

    return inFlight.current;
  };

  const clear = () => {
    cached = null;
    cachedStatus = "idle";
    setLocation(null);
    setStatus("idle");
    setError(null);
  };

  return { location, status, error, request, clear };
}
