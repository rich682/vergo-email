import { NextRequest } from "next/server"

/**
 * Validate that a request originates from our own domain (CSRF protection).
 * Checks the Origin header (or Referer as fallback) against the app's URL.
 * Returns true if the request is safe, false if it looks like a cross-origin forgery.
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")

  // In development, warn but still validate if possible
  if (process.env.NODE_ENV === "development" && !origin && !referer) {
    return true
  }

  // Collect all allowed origins
  const allowedOrigins = new Set<string>()

  // Primary app URL
  const appUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
  if (appUrl) {
    try {
      const parsed = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`)
      allowedOrigins.add(parsed.origin)
    } catch {
      console.warn("[CSRF] Failed to parse app URL")
    }
  }

  // Custom domain (e.g. app.tryvergo.com)
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL
  if (publicUrl) {
    try {
      const parsed = new URL(publicUrl.startsWith("http") ? publicUrl : `https://${publicUrl}`)
      allowedOrigins.add(parsed.origin)
    } catch {
      console.warn("[CSRF] Failed to parse NEXT_PUBLIC_APP_URL")
    }
  }

  if (allowedOrigins.size === 0) {
    console.warn("[CSRF] No NEXTAUTH_URL, VERCEL_URL, or NEXT_PUBLIC_APP_URL configured — skipping origin check")
    return true
  }

  // Check Origin header first (most reliable)
  if (origin) {
    return allowedOrigins.has(origin)
  }

  // Fallback to Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      return allowedOrigins.has(refererOrigin)
    } catch {
      return false
    }
  }

  // No Origin or Referer — reject (non-browser clients should set Origin)
  return false
}
