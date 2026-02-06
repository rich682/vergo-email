/**
 * Email Validation Utilities
 * 
 * Pre-send validation to catch bad addresses before wasting API calls.
 * - Format validation (regex)
 * - MX record check (DNS lookup to verify domain can receive/has mail infrastructure)
 * 
 * MX results are cached in-memory to avoid repeated DNS lookups for the same domain
 * during bulk sends.
 */

import dns from "dns"

// In-memory cache for MX record lookups (domain -> { hasMx, checkedAt })
// Entries expire after 10 minutes to handle DNS changes
const mxCache = new Map<string, { hasMx: boolean; checkedAt: number }>()
const MX_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Common typo corrections for popular domains
const DOMAIN_TYPO_MAP: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlool.com": "outlook.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
}

/**
 * Validate email format using a reasonable regex.
 * Not RFC 5322 complete, but catches the vast majority of invalid formats.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false
  const trimmed = email.trim()
  // Basic format: local@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

/**
 * Extract domain from an email address
 */
export function extractDomain(email: string): string | null {
  if (!email || !email.includes("@")) return null
  return email.trim().split("@")[1]?.toLowerCase() || null
}

/**
 * Check if a domain is a known typo and return the suggested correction
 */
export function suggestDomainCorrection(domain: string): string | null {
  const lower = domain.toLowerCase()
  return DOMAIN_TYPO_MAP[lower] || null
}

/**
 * Check if a domain has valid MX records (can receive email).
 * Results are cached in-memory to avoid repeated DNS lookups during bulk sends.
 * 
 * Returns: { valid: true } or { valid: false, reason: string }
 */
export async function checkMxRecords(domain: string): Promise<{ valid: boolean; reason?: string }> {
  const lowerDomain = domain.toLowerCase()

  // Check cache first
  const cached = mxCache.get(lowerDomain)
  if (cached && Date.now() - cached.checkedAt < MX_CACHE_TTL_MS) {
    if (cached.hasMx) return { valid: true }
    return { valid: false, reason: `Domain "${lowerDomain}" has no mail server` }
  }

  try {
    const records = await dns.promises.resolveMx(lowerDomain)
    const hasMx = records && records.length > 0
    mxCache.set(lowerDomain, { hasMx, checkedAt: Date.now() })

    if (hasMx) {
      return { valid: true }
    }
    return { valid: false, reason: `Domain "${lowerDomain}" has no mail server (no MX records)` }
  } catch (error: any) {
    // ENOTFOUND = domain doesn't exist at all
    if (error.code === "ENOTFOUND") {
      mxCache.set(lowerDomain, { hasMx: false, checkedAt: Date.now() })

      // Check for common typo
      const suggestion = suggestDomainCorrection(lowerDomain)
      if (suggestion) {
        return {
          valid: false,
          reason: `Domain "${lowerDomain}" does not exist — did you mean "${suggestion}"?`,
        }
      }
      return { valid: false, reason: `Domain "${lowerDomain}" does not exist` }
    }

    // ENODATA = domain exists but no MX records
    if (error.code === "ENODATA") {
      // Some domains use A record fallback for mail - treat as valid but marginal
      mxCache.set(lowerDomain, { hasMx: true, checkedAt: Date.now() })
      return { valid: true }
    }

    // SERVFAIL, ETIMEOUT, etc. = DNS infrastructure issue, allow the send (fail open)
    console.warn(`[EmailValidation] MX lookup failed for ${lowerDomain}: ${error.code || error.message}`)
    return { valid: true }
  }
}

/**
 * Full pre-send email validation.
 * Returns { valid: true } or { valid: false, reason: string }
 * 
 * Checks:
 * 1. Format validation
 * 2. Domain MX record existence
 */
export async function validateEmailForSend(email: string): Promise<{ valid: boolean; reason?: string }> {
  // 1. Format check
  if (!isValidEmailFormat(email)) {
    return { valid: false, reason: `Invalid email format: "${email}"` }
  }

  // 2. Extract domain
  const domain = extractDomain(email)
  if (!domain) {
    return { valid: false, reason: `Cannot extract domain from "${email}"` }
  }

  // 3. MX record check
  return checkMxRecords(domain)
}
