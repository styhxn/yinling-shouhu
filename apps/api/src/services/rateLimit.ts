export type RateLimitRule = {
  max: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const MAX_BUCKETS = 20_000;

/** Small in-memory fixed-window limiter; good enough for a single-instance deployment. */
export function createRateLimiter(enabled: boolean) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;

  function sweep(now: number) {
    if (now - lastSweep < 30_000) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    if (buckets.size > MAX_BUCKETS) {
      const overflow = buckets.size - MAX_BUCKETS;
      let removed = 0;
      for (const key of buckets.keys()) {
        buckets.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }

  function consume(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    if (!enabled) {
      return { allowed: true, remaining: rule.max, resetAt: now + rule.windowMs };
    }
    sweep(now);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + rule.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= rule.max,
      remaining: Math.max(0, rule.max - bucket.count),
      resetAt: bucket.resetAt
    };
  }

  return { enabled, consume };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
