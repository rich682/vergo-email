import { createHmac } from "crypto"

const STATE_SEPARATOR = "."

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for OAuth state signing")
  return secret
}

/**
 * Sign an OAuth state payload with HMAC-SHA256 to prevent tampering.
 * Format: base64(payload).base64(signature)
 */
export function signOAuthState(payload: Record<string, unknown>): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url")
  return `${data}${STATE_SEPARATOR}${sig}`
}

/**
 * Verify and parse a signed OAuth state parameter.
 * Returns the parsed payload or null if the signature is invalid.
 */
export function verifyOAuthState(state: string): Record<string, any> | null {
  const sepIdx = state.lastIndexOf(STATE_SEPARATOR)
  if (sepIdx === -1) {
    // Legacy unsigned state — attempt to parse as plain JSON for backwards compatibility
    try {
      return JSON.parse(state)
    } catch {
      try {
        return JSON.parse(decodeURIComponent(state))
      } catch {
        return null
      }
    }
  }

  const data = state.slice(0, sepIdx)
  const sig = state.slice(sepIdx + 1)
  const expected = createHmac("sha256", getSecret()).update(data).digest("base64url")

  if (sig !== expected) return null

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString())
  } catch {
    return null
  }
}
