import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailDraft: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    entity: {
      findMany: vi.fn(),
    },
    request: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}))

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}))

// Mock email sending
vi.mock("@/lib/services/email-sending.service", () => ({
  EmailSendingService: {
    sendEmail: vi.fn(),
    sendBulkEmail: vi.fn(),
    generateThreadId: vi.fn().mockReturnValue("thread-123"),
    generateReplyToAddress: vi.fn().mockReturnValue("reply@test.com"),
    extractDomainFromEmail: vi.fn().mockReturnValue("test.com"),
  },
}))

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

import { prisma } from "@/lib/prisma"

describe("QuestService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findDueStandingQuests", () => {
    it("returns empty array when no unsent drafts exist", async () => {
      vi.mocked(prisma.emailDraft.findMany).mockResolvedValue([])

      // Dynamic import to ensure mocks are applied
      const { QuestService } = await import("@/lib/services/quest.service")
      const result = await QuestService.findDueStandingQuests()

      expect(result).toEqual([])
    })

    it("respects take: 200 limit on draft query", async () => {
      vi.mocked(prisma.emailDraft.findMany).mockResolvedValue([])

      const { QuestService } = await import("@/lib/services/quest.service")
      await QuestService.findDueStandingQuests()

      expect(prisma.emailDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
        })
      )
    })
  })

  describe("findByOrganization", () => {
    it("queries drafts for the given organization", async () => {
      vi.mocked(prisma.emailDraft.findMany).mockResolvedValue([])

      const { QuestService } = await import("@/lib/services/quest.service")
      const result = await QuestService.findByOrganization("org-123")

      expect(result).toEqual([])
      expect(prisma.emailDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-123",
          }),
        })
      )
    })
  })
})
