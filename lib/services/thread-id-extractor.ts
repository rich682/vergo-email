export class ThreadIdExtractor {
  static extractFromReplyTo(replyTo: string): string | null {
    // Format: verify+threadId@domain.com
    const match = replyTo.match(/verify\+([^@]+)@/)
    return match ? match[1] : null
  }

  static extractFromEmailAddress(email: string): string | null {
    // Try to extract from various formats
    // Format 1: verify+threadId@domain.com
    let threadId = this.extractFromReplyTo(email)
    if (threadId) return threadId

    // Format 2: threadId@domain.com (if domain allows)
    const match = email.match(/^([a-f0-9-]+)@/)
    if (match && this.isValidUUID(match[1])) {
      return match[1]
    }

    return null
  }

  static isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }
}










