interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class TTLCache {
  private store = new Map<string, CacheEntry>();

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Returns the Date at which the soonest-to-expire live entry will expire.
   * Used to populate WeatherResponse.meta.nextRefreshAt so the client knows
   * when to expect fresh data.
   */
  nextExpiryTime(): Date | null {
    const now = Date.now();
    let soonest: number | null = null;
    for (const entry of this.store.values()) {
      if (entry.expiresAt <= now) continue;
      if (soonest === null || entry.expiresAt < soonest) {
        soonest = entry.expiresAt;
      }
    }
    return soonest === null ? null : new Date(soonest);
  }

  clear(): void {
    this.store.clear();
  }
}
