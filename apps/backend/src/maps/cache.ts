interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(options: { maxEntries?: number; defaultTtlSeconds?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.defaultTtlMs = (options.defaultTtlSeconds ?? 300) * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlSeconds?: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }

    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
