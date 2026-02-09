/**
 * Validate an email address using a practical regex.
 * Prevents header injection by rejecting newlines, and ensures
 * basic RFC 5322 structure (local@domain.tld).
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function isValidEmail(email: unknown): email is string {
  if (!email || typeof email !== "string") return false
  if (email.length > 254) return false
  // Reject newlines/carriage returns (header injection prevention)
  if (/[\r\n]/.test(email)) return false
  return EMAIL_REGEX.test(email)
}
