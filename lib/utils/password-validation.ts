/**
 * Shared password validation for signup, reset, and invite flows.
 */

const MIN_LENGTH = 12

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required" }
  }

  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters` }
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must include a lowercase letter" }
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must include an uppercase letter" }
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must include a number" }
  }

  return { valid: true }
}

export const PASSWORD_HINT = "At least 12 characters with uppercase, lowercase, and a number"
