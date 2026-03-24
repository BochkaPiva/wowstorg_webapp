type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Tiny process-level TTL cache for hot read-only API responses.
 * Safe for correctness: short TTL and explicit key scoping.
 */
export async function getOrSetRuntimeCache<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;
  const value = await factory();
  store.set(key, { value, expiresAt: now + Math.max(100, ttlMs) });
  return value;
}

