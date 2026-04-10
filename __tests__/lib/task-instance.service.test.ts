import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskInstance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    request: { count: vi.fn(), updateMany: vi.fn() },
    board: { findFirst: vi.fn() },
    taskInstanceCollaborator: { findUnique: vi.fn() },
    boardCollaborator: { findUnique: vi.fn() },
    taskCollaborator: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    taskComment: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
  prismaWithDeleted: {
    taskInstance: { update: vi.fn() },
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

vi.mock("@/lib/services/board.service", () => ({
  BoardService: { recomputeBoardStatus: vi.fn() },
}))

import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { prisma } from "@/lib/prisma"

describe("TaskInstanceService", () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe("canUserAccess", () => {
    it("grants access to task owner for edit action", async () => {
      const result = await TaskInstanceService.canUserAccess(
        "user-1",
        "MEMBER",
        { id: "task-1", ownerId: "user-1", boardId: null },
        "edit"
      )
      expect(result).toBe(true)
    })

    it("grants access to ADMIN for any action", async () => {
      const result = await TaskInstanceService.canUserAccess(
        "user-1",
        "ADMIN",
        { id: "task-1", ownerId: "user-2", boardId: null },
        "edit"
      )
      expect(result).toBe(true)
    })

    it("denies access to non-owner MEMBER for edit", async () => {
      vi.mocked(prisma.taskInstanceCollaborator.findUnique).mockResolvedValue(null)
      const result = await TaskInstanceService.canUserAccess(
        "user-1",
        "MEMBER",
        { id: "task-1", ownerId: "user-2", boardId: null },
        "edit"
      )
      expect(result).toBe(false)
    })
  })

  describe("resolveStakeholderCount", () => {
    it("returns 0 for empty stakeholders", async () => {
      const result = await TaskInstanceService.resolveStakeholderCount([], "org-1")
      expect(result).toBe(0)
    })

    it("counts individual stakeholders by ID", async () => {
      const stakeholders = [
        { type: "individual" as const, id: "contact-1" },
        { type: "individual" as const, id: "contact-2" },
      ]
      const result = await TaskInstanceService.resolveStakeholderCount(stakeholders, "org-1")
      expect(result).toBe(2)
    })

    it("deduplicates same contact ID", async () => {
      const stakeholders = [
        { type: "individual" as const, id: "contact-1" },
        { type: "individual" as const, id: "contact-1" },
      ]
      const result = await TaskInstanceService.resolveStakeholderCount(stakeholders, "org-1")
      expect(result).toBe(1)
    })
  })
})
