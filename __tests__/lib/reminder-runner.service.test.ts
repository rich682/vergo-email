import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reminderState: { findMany: vi.fn(), update: vi.fn() },
    formRequest: { findMany: vi.fn(), update: vi.fn() },
    request: { findFirst: vi.fn() },
    connectedEmailAccount: { findFirst: vi.fn() },
    raw: vi.fn().mockReturnValue(999), // mock for (prisma as any).raw() used in reminder queries
  },
}))

vi.mock("@/lib/services/reminder-template.service", () => ({
  ReminderTemplateService: { generateReminderContent: vi.fn() },
}))

vi.mock("@/lib/utils/template-renderer", () => ({
  renderTemplate: vi.fn().mockReturnValue("rendered content"),
}))

vi.mock("@/lib/services/email-sending.service", () => ({
  EmailSendingService: { sendEmailForExistingTask: vi.fn() },
}))

vi.mock("@/lib/services/form-notification.service", () => ({
  FormNotificationService: { sendFormReminder: vi.fn() },
}))

import { runDueRemindersOnce, runDueFormRemindersOnce } from "@/lib/services/reminder-runner.service"
import { prisma } from "@/lib/prisma"

describe("reminder-runner", () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe("runDueRemindersOnce", () => {
    it("returns zero counts when no reminders are due", async () => {
      vi.mocked(prisma.reminderState.findMany).mockResolvedValue([])

      const result = await runDueRemindersOnce()

      expect(result).toEqual({
        remindersChecked: 0,
        remindersSent: 0,
        remindersSkipped: 0,
      })
    })
  })

  describe("runDueFormRemindersOnce", () => {
    it("returns zero counts when no form reminders are due", async () => {
      vi.mocked(prisma.formRequest.findMany).mockResolvedValue([])

      const result = await runDueFormRemindersOnce()

      expect(result).toEqual({
        remindersChecked: 0,
        remindersSent: 0,
        remindersSkipped: 0,
      })
    })

    it("respects take: 500 pagination limit", async () => {
      vi.mocked(prisma.formRequest.findMany).mockResolvedValue([])

      await runDueFormRemindersOnce()

      expect(prisma.formRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 })
      )
    })
  })
})
