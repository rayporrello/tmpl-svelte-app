/**
 * In-memory token-bucket rate limiter.
 *
 * Scope: single-node, process-lifetime. This is a local abuse guard, not
 * distributed security — buckets reset on server restart and are not shared
 * across instances. For distributed rate limiting, use a Redis-backed solution
 * (Upstash, etc.) and replace this module with your own EmailProvider middleware.
 *
 * Activation: set RATE_LIMIT_ENABLED=true in your env. Without this flag,
 * checkRateLimit() always returns true (allow all).
 *
 * Algorithm: token bucket.
 *   - Each key starts with `capacity` tokens.
 *   - One token is consumed per request.
 *   - Tokens refill at `refillRatePerSecond` continuously up to `capacity`.
 *   - When tokens < 1 the request is rejected.
 */

const CAPACITY = 5; // maximum burst
const REFILL_RATE_PER_SECOND = 1 / 60; // 1 token per minute

interface Bucket {
	tokens: number;
	lastRefill: number; // ms since epoch
}

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { tokens: CAPACITY, lastRefill: Date.now() };
		buckets.set(key, bucket);
	}
	return bucket;
}

function refill(bucket: Bucket): void {
	const now = Date.now();
	const elapsed = (now - bucket.lastRefill) / 1000; // seconds
	bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_SECOND);
	bucket.lastRefill = now;
}

/**
 * Check whether the given key is within the rate limit.
 *
 * Returns true (allow) or false (reject). When RATE_LIMIT_ENABLED is not "true"
 * this is always a no-op and returns true.
 */
export function checkRateLimit(key: string): boolean {
	if (process.env.RATE_LIMIT_ENABLED !== 'true') return true;

	const bucket = getBucket(key);
	refill(bucket);

	if (bucket.tokens >= 1) {
		bucket.tokens -= 1;
		return true;
	}
	return false;
}
