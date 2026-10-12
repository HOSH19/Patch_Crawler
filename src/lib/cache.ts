type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
