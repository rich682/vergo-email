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

    return `Follow-up #${reminderNumber}: ${originalSubject}`
  }

  /**
   * Generate reminder body based on reminder number and max reminders
   * Includes original request context and escalating tone
   */
  static getReminderBody(
    originalBody: string,
    reminderNumber: number,
    maxReminders: number,
    deadlineDate?: Date | null
  ): string {
    const isFinal = reminderNumber === maxReminders

    let intro: string
    let closing: string

    if (isFinal) {
      intro = "This is a final reminder regarding my previous request:"
      closing = deadlineDate
        ? `Please respond by ${deadlineDate.toLocaleDateString()} or let me know if there are any issues.`
        : "Please respond at your earliest convenience or let me know if there are any issues."
    } else if (reminderNumber === 1) {
      intro = "Just following up on my previous request:"
      closing = "Please let me know if you have any questions."
    } else {
      intro = "I wanted to follow up again on my previous request:"
      closing = "Please respond at your earliest convenience."
    }

    // Construct the reminder body
    // Note: The actual greeting (Hi [Name],) and signature will be added by the email sending service
    // This template focuses on the reminder content itself
    return `${intro}\n\n${originalBody}\n\n${closing}`
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
