/**
 * Rate limiting utility with distributed Redis support via Upstash.
 *
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set,
 * uses Upstash Redis for distributed rate limiting (works across serverless instances).
 *
 * Otherwise, falls back to in-memory rate limiting (best-effort, resets on cold start).
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 10 // 10 requests per minute per key

// --- Upstash Redis (distributed, production-ready) ---

let upstashRatelimit: Ratelimit | null = null

function getUpstashRatelimit(): Ratelimit | null {
  if (upstashRatelimit) return upstashRatelimit

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  try {
    const redis = new Redis({ url, token })
    upstashRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_REQUESTS, "60 s"),
      analytics: false,
      prefix: "vergo:ratelimit",
    })
    return upstashRatelimit
  } catch (err) {
    console.warn("Failed to initialize Upstash rate limiter, falling back to in-memory:", err)
    return null
  }
}

// --- In-memory fallback (best-effort for serverless) ---

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

let warnedAboutFallback = false

function inMemoryRateLimit(key: string, maxRequests: number): { allowed: boolean; retryAfterMs?: number } {
  if (!warnedAboutFallback) {
    console.warn(
      "[rate-limit] Using in-memory rate limiting (resets on cold start). " +
      "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed rate limiting."
    )
    warnedAboutFallback = true
  }

  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true }
}

// --- Public API (unchanged contract) ---

export async function checkRateLimit(
  key: string,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const upstash = getUpstashRatelimit()

  if (upstash) {
    try {
      const result = await upstash.limit(key)
      if (result.success) {
        return { allowed: true }
      }
      // Calculate retry-after from reset time
      const retryAfterMs = Math.max(0, result.reset - Date.now())
      return { allowed: false, retryAfterMs }
    } catch (err) {
      // If Upstash fails, fall back to in-memory for this request
      console.error("Upstash rate limit error, falling back to in-memory:", err)
      return inMemoryRateLimit(key, maxRequests)
    }
  }

  return inMemoryRateLimit(key, maxRequests)
}

// For testing — allows resetting rate limit state between tests
export function _resetRateLimitForTesting() {
  rateLimitMap.clear()
  upstashRatelimit = null
  warnedAboutFallback = false
}
