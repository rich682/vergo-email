/**
 * Service for generating reminder email templates
 * Uses deterministic template substitution (no LLM for MVP)
 */

export interface ReminderTemplateOptions {
  originalSubject: string
  originalBody: string
  reminderNumber: number
  maxReminders: number
}

export interface ReminderTemplateResult {
  subject: string
  body: string
}

export class ReminderTemplateService {
  /**
   * Generate reminder subject based on reminder number and max reminders
   */
  static getReminderSubject(
    originalSubject: string,
    reminderNumber: number,
    maxReminders: number
  ): string {
    const isFinal = reminderNumber === maxReminders

    if (isFinal) {
      return `Final reminder: ${originalSubject}`
    }

    if (reminderNumber === 1) {
      return `Follow-up: ${originalSubject}`
    }

    return `Reminder ${reminderNumber}: ${originalSubject}`
  }

  /**
   * Extract the core request from the original body
   * Removes greeting, closing, and signature to get the main message
   */
  private static extractCoreRequest(originalBody: string): string {
    let body = originalBody

    // Remove common greetings
    body = body.replace(/^(Dear\s+\{\{[^}]+\}\},?\s*\n*|Dear\s+[^,\n]+,?\s*\n*|Hello,?\s*\n*|Hi,?\s*\n*)/i, '')
    
    // Remove common closings and everything after
    const closingPatterns = [
      /\n*(Thank you for your prompt attention[^\n]*\n*Best regards,?.*)/is,
      /\n*(Thank you[^\n]*\n*Best regards,?.*)/is,
      /\n*(Best regards,?.*)/is,
      /\n*(Kind regards,?.*)/is,
      /\n*(Thanks,?.*)/is,
      /\n*(Sincerely,?.*)/is,
    ]
    
    for (const pattern of closingPatterns) {
      body = body.replace(pattern, '')
    }

    return body.trim()
  }

  /**
   * Generate reminder body based on reminder number and max reminders
   * Creates a reworded follow-up, not just a prefix on the original
   */
  static getReminderBody(
    originalBody: string,
    reminderNumber: number,
    maxReminders: number,
    deadlineDate?: Date | null
  ): string {
    const isFinal = reminderNumber === maxReminders
    const coreRequest = this.extractCoreRequest(originalBody)

    // Build deadline context if available
    const deadlineContext = deadlineDate
      ? ` The deadline is ${deadlineDate.toLocaleDateString()}.`
      : ''

    if (isFinal) {
      return `Dear {{First Name}},

This is my final follow-up regarding our previous correspondence.${deadlineContext}

${coreRequest}

I understand you may be busy, but I would greatly appreciate a response at your earliest convenience. If there are any issues or concerns preventing you from responding, please let me know and I'll be happy to assist.

Thank you for your attention to this matter.

Best regards,`
    } else if (reminderNumber === 1) {
      return `Dear {{First Name}},

I wanted to follow up on my previous email.${deadlineContext}

${coreRequest}

Please let me know if you need any additional information or have any questions.

Thank you,

Best regards,`
    } else {
      return `Dear {{First Name}},

I'm following up again on my earlier request.${deadlineContext}

${coreRequest}

I would appreciate an update when you have a moment. Please don't hesitate to reach out if you have any questions.

Thank you,

Best regards,`
    }
  }

  /**
   * Generate both subject and body for a reminder
   */
  static generateReminderTemplate(
    options: ReminderTemplateOptions
  ): ReminderTemplateResult {
    const { originalSubject, originalBody, reminderNumber, maxReminders } =
      options

    const subject = this.getReminderSubject(
      originalSubject,
      reminderNumber,
      maxReminders
    )
    const body = this.getReminderBody(
      originalBody,
      reminderNumber,
      maxReminders
    )

    return { subject, body }
  }

  /**
   * Generate reminder template with deadline context
   */
  static generateReminderTemplateWithDeadline(
    options: ReminderTemplateOptions & { deadlineDate?: Date | null }
  ): ReminderTemplateResult {
    const {
      originalSubject,
      originalBody,
      reminderNumber,
      maxReminders,
      deadlineDate,
    } = options

    const subject = this.getReminderSubject(
      originalSubject,
      reminderNumber,
      maxReminders
    )
    const body = this.getReminderBody(
      originalBody,
      reminderNumber,
      maxReminders,
      deadlineDate
    )

    return { subject, body }
  }
}
