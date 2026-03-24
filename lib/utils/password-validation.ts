/**
 * Shared password validation for signup, reset, and invite flows.
 */

const MIN_LENGTH = 8

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required" }
  }

  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters` }
  }

  return { valid: true }
}

export const PASSWORD_HINT = "At least 8 characters"
