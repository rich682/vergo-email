import { NextRequest } from "next/server"

/**
 * Validate that a request originates from our own domain (CSRF protection).
 * Checks the Origin header (or Referer as fallback) against the app's URL.
 * Returns true if the request is safe, false if it looks like a cross-origin forgery.
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")

  // In development, skip origin check
  if (process.env.NODE_ENV === "development") {
    return true
  }

  const appUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
  if (!appUrl) {
    // If we can't determine our own URL, allow (fail-open in misconfigured envs)
    console.warn("[CSRF] No NEXTAUTH_URL or VERCEL_URL configured — skipping origin check")
    return true
  }

  // Normalize the app URL to just the origin (scheme + host)
  let expectedOrigin: string
  try {
    const parsed = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`)
    expectedOrigin = parsed.origin
  } catch {
    console.warn("[CSRF] Failed to parse app URL — skipping origin check")
    return true
  }

  // Check Origin header first (most reliable)
  if (origin) {
    return origin === expectedOrigin
  }

  // Fallback to Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      return refererOrigin === expectedOrigin
    } catch {
      return false
    }
  }

  // No Origin or Referer — reject (non-browser clients should set Origin)
  return false
}
