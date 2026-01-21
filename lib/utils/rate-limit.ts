// Simple in-memory rate limiting for API routes
// Resets on cold start - acceptable for serverless best-effort protection

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 10 // 10 requests per minute per org

export function checkRateLimit(orgId: string, maxRequests: number = RATE_LIMIT_MAX_REQUESTS): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(orgId)
  
  if (!entry || now > entry.resetAt) {
    // Start new window
    rateLimitMap.set(orgId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true }
  }
  
  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }
  
  entry.count++
  return { allowed: true }
}

// For testing - allows resetting rate limit state between tests
export function _resetRateLimitForTesting() {
  rateLimitMap.clear()
}
