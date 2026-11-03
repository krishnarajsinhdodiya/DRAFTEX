// In-memory sliding-window limiter, keyed by client address. One process
// serves DRAFTEX, so memory is enough; limits reset when the app restarts.
export interface RateLimiter {
  /** Records an attempt. Returns 0 if allowed, else milliseconds until the next one is. */
  hit(key: string): number;
  reset(key: string): void;
}

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
  /** Cap on tracked keys so a flood of addresses cannot grow memory without bound. */
  maxKeys?: number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, number[]>();

  return {
    hit(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > t - opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return recent[0]! + opts.windowMs - t;
      }
      recent.push(t);
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return 0;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
