import { RateLimitError } from "./errors";

/**
 * Limiteur en mémoire (fenêtre glissante). Suffisant pour une instance unique ;
 * pour un déploiement multi-instances, remplacer par un store partagé (Redis).
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 15 * 60_000);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export type RateLimitOptions = { limit: number; windowMs: number };

export function checkRateLimit(key: string, opts: RateLimitOptions): { ok: boolean; remaining: number } {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
  if (bucket.hits.length >= opts.limit) {
    buckets.set(key, bucket);
    return { ok: false, remaining: 0 };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: opts.limit - bucket.hits.length };
}

export function enforceRateLimit(key: string, opts: RateLimitOptions): void {
  if (!checkRateLimit(key, opts).ok) throw new RateLimitError();
}

export function resetRateLimits(): void {
  buckets.clear();
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 10, windowMs: 60 * 60_000 },
  forgotPassword: { limit: 5, windowMs: 60 * 60_000 },
  portal: { limit: 60, windowMs: 15 * 60_000 },
  portalDecision: { limit: 10, windowMs: 15 * 60_000 },
  upload: { limit: 120, windowMs: 15 * 60_000 },
} as const;
