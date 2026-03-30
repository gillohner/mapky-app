const CACHE_PREFIX = "mapky-nominatim:";
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry<T> {
  data: T;
  expires: number;
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  try {
    const entry: CacheEntry<T> = { data, expires: Date.now() + ttl };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function makeReverseKey(lat: number, lon: number): string {
  // Round to 5 decimal places (~1m precision) to improve cache hits
  return `rev:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function makeSearchKey(query: string): string {
  return `search:${query.toLowerCase().trim()}`;
}
