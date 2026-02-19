/**
 * Consolidated bounce and out-of-office detection patterns.
 * Merges patterns from ai-classification.service.ts and risk-computation.service.ts
 * into a single source of truth for email delivery failure detection.
 */

// === Bounce Detection ===

const BOUNCE_FROM_PATTERNS = [
  "mailer-daemon",
  "postmaster",
  "mail delivery",
  "maildelivery",
]

const BOUNCE_SUBJECT_PATTERNS = [
  "delivery status notification",
  "undeliverable",
  "mail delivery failed",
  "delivery failure",
  "returned mail",
  "delivery has failed",
  "message not delivered",
]

const BOUNCE_BODY_PATTERNS = [
  "address not found",
  "address couldn't be found",
  "user unknown",
  "no such user",
  "mailbox not found",
  "mailbox unavailable",
  "recipient rejected",
  "550 5.1.1",
  "550-5.1.1",
  "550 user unknown",
  "action: failed",
  "status: 5.",
  "diagnostic-code: smtp",
  "the email account that you tried to reach does not exist",
  "wasn't delivered to",
  "could not be delivered",
  "permanent failure",
  "mailbox full",
  "over quota",
]

/**
 * Detect if a message is a bounce/delivery failure.
 * Checks from-address, subject, and body text for known delivery failure patterns.
 */
export function isBounce(input: {
  subject?: string | null
  body?: string | null
  fromAddress?: string | null
}): boolean {
  const subject = (input.subject || "").toLowerCase()
  const body = (input.body || "").toLowerCase()
  const from = (input.fromAddress || "").toLowerCase()

  if (BOUNCE_FROM_PATTERNS.some(p => from.includes(p))) return true
  if (BOUNCE_SUBJECT_PATTERNS.some(p => subject.includes(p))) return true
  if (BOUNCE_BODY_PATTERNS.some(p => body.includes(p))) return true

  return false
}

// === Out-of-Office Detection ===

const OOO_SUBJECT_PATTERNS = [
  "out of office",
  "out of the office",
  "automatic reply",
  "auto-reply",
  "autoreply",
  "away from",
  "on vacation",
  "on leave",
  "on holiday",
]

const OOO_BODY_PATTERNS = [
  "i am currently out of the office",
  "i'm currently out of the office",
  "i will be out of the office",
  "i am away from",
  "i'm away from",
  "i am currently away",
  "i'm currently away",
  "limited access to email",
  "will respond when i return",
  "will reply when i return",
]

/**
 * Detect if a message is an out-of-office auto-reply.
 * Checks subject and body text for OOO indicator patterns.
 */
export function isOutOfOffice(input: {
  subject?: string | null
  body?: string | null
}): boolean {
  const subject = (input.subject || "").toLowerCase()
  const body = (input.body || "").toLowerCase()

  if (OOO_SUBJECT_PATTERNS.some(p => subject.includes(p))) return true
  if (OOO_BODY_PATTERNS.some(p => body.includes(p))) return true

  return false
}
