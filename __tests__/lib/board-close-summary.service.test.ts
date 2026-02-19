import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the service
const mockFindFirst = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    board: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}))

// Mock OpenAI — make AI calls fail so we test the deterministic path
vi.mock('@/lib/utils/openai-client', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}))

vi.mock('@/lib/utils/openai-retry', () => ({
  callOpenAI: vi.fn().mockRejectedValue(new Error('AI unavailable')),
}))

import { BoardCloseSummaryService } from '@/lib/services/board-close-summary.service'

function makeBoard(overrides: Record<string, any> = {}) {
  return {
    id: 'board-1',
    name: 'January 2026',
    status: 'CLOSED',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-31'),
    closedAt: new Date('2026-01-28'),
    updatedAt: new Date('2026-01-30'),
    taskInstances: [],
    ...overrides,
  }
}

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: 'task-1',
    name: 'Bank Reconciliation',
    status: 'COMPLETE',
    dueDate: new Date('2026-01-20'),
    completedAt: new Date('2026-01-19'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-19'),
    ...overrides,
  }
}

describe('BoardCloseSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateCloseSummary', () => {
    it('should throw "Board not found" when board does not exist', async () => {
      mockFindFirst.mockResolvedValue(null)

      await expect(
        BoardCloseSummaryService.generateCloseSummary({
          boardId: 'nonexistent',
          organizationId: 'org-1',
        })
      ).rejects.toThrow('Board not found')
    })

    it('should throw "Board is not closed" when status is IN_PROGRESS', async () => {
      mockFindFirst.mockResolvedValue(makeBoard({ status: 'IN_PROGRESS' }))

      await expect(
        BoardCloseSummaryService.generateCloseSummary({
          boardId: 'board-1',
          organizationId: 'org-1',
        })
      ).rejects.toThrow('Board is not closed')
    })

    it('should calculate closeSpeed as "early" when closedAt <= periodEnd', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          closedAt: new Date('2026-01-25'),
          periodEnd: new Date('2026-01-31'),
          taskInstances: [makeTask()],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.closeSpeed).toBe('early')
      expect(result.summary.daysToClose).toBe(24) // Jan 1 → Jan 25
    })

    it('should calculate closeSpeed as "late" when closedAt > periodEnd', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          closedAt: new Date('2026-02-05'),
          periodEnd: new Date('2026-01-31'),
          taskInstances: [makeTask()],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.closeSpeed).toBe('late')
    })

    it('should use updatedAt as proxy when closedAt is null (legacy board)', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          closedAt: null,
          updatedAt: new Date('2026-01-28'),
          taskInstances: [makeTask()],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      // updatedAt (Jan 28) <= periodEnd (Jan 31), so "early"
      expect(result.summary.closeSpeed).toBe('early')
      expect(result.summary.daysToClose).toBe(27) // Jan 1 → Jan 28
    })

    it('should identify IN_PROGRESS/BLOCKED/WAITING tasks as blockers', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          taskInstances: [
            makeTask({ name: 'Blocker A', status: 'IN_PROGRESS', completedAt: null }),
            makeTask({ name: 'Blocker B', status: 'BLOCKED', completedAt: null }),
            makeTask({ name: 'Done Task', status: 'COMPLETE' }),
          ],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      const blockerNames = result.summary.blockerTasks.map(t => t.name)
      expect(blockerNames).toContain('Blocker A')
      expect(blockerNames).toContain('Blocker B')
    })

    it('should cap blocker tasks at 5', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        makeTask({
          id: `task-${i}`,
          name: `Task ${i}`,
          status: 'IN_PROGRESS',
          completedAt: null,
          createdAt: new Date(`2026-01-0${Math.min(i + 1, 9)}`),
        })
      )

      mockFindFirst.mockResolvedValue(makeBoard({ taskInstances: tasks }))

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.blockerTasks.length).toBeLessThanOrEqual(5)
    })

    it('should identify tasks where completedAt > dueDate as missed targets', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          taskInstances: [
            makeTask({
              name: 'Late Task',
              dueDate: new Date('2026-01-15'),
              completedAt: new Date('2026-01-20'),
              updatedAt: new Date('2026-01-20'),
            }),
            makeTask({
              name: 'On Time Task',
              dueDate: new Date('2026-01-20'),
              completedAt: new Date('2026-01-18'),
              updatedAt: new Date('2026-01-18'),
            }),
          ],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.missedTargetTasks.length).toBe(1)
      expect(result.summary.missedTargetTasks[0].name).toBe('Late Task')
      expect(result.summary.missedTargetTasks[0].daysLate).toBe(5)
    })

    it('should skip tasks without dueDate when computing missed targets', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          taskInstances: [
            makeTask({ name: 'No Due Date', dueDate: null }),
          ],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.missedTargetTasks.length).toBe(0)
    })

    it('should identify tasks completed after periodEnd as late tasks', async () => {
      mockFindFirst.mockResolvedValue(
        makeBoard({
          periodEnd: new Date('2026-01-31'),
          taskInstances: [
            makeTask({
              name: 'Late Finish',
              status: 'COMPLETE',
              completedAt: new Date('2026-02-03'),
              updatedAt: new Date('2026-02-03'),
            }),
            makeTask({
              name: 'On Time',
              status: 'COMPLETE',
              completedAt: new Date('2026-01-25'),
              updatedAt: new Date('2026-01-25'),
            }),
          ],
        })
      )

      const result = await BoardCloseSummaryService.generateCloseSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summary.lateTasks.length).toBe(1)
      expect(result.summary.lateTasks[0].name).toBe('Late Finish')
      expect(result.summary.lateTasks[0].completedDaysAfterTarget).toBe(3)
    })
  })

  describe('generateDeterministicInsights', () => {
    // Access the private static method via bracket notation
    const getInsights = (data: any) =>
      (BoardCloseSummaryService as any).generateDeterministicInsights(data)

    it('should report late close with days count', () => {
      const insights = getInsights({
        closeSpeed: 'late',
        daysToClose: 35,
        totalTasks: 10,
        missedTargetTasks: 0,
        lateTasks: 0,
      })

      expect(insights[0]).toContain('35 days')
    })

    it('should report missed target task count', () => {
      const insights = getInsights({
        closeSpeed: 'early',
        daysToClose: 20,
        totalTasks: 10,
        missedTargetTasks: 3,
        lateTasks: 0,
      })

      expect(insights.some((i: string) => i.includes('3') && i.includes('missed'))).toBe(true)
    })

    it('should report late task count', () => {
      const insights = getInsights({
        closeSpeed: 'early',
        daysToClose: 20,
        totalTasks: 10,
        missedTargetTasks: 0,
        lateTasks: 2,
      })

      expect(insights.some((i: string) => i.includes('2') && i.includes('completed after'))).toBe(true)
    })

    it('should report all on schedule when no issues', () => {
      const insights = getInsights({
        closeSpeed: 'early',
        daysToClose: 20,
        totalTasks: 5,
        missedTargetTasks: 0,
        lateTasks: 0,
      })

      // The close speed message always comes first
      expect(insights[0]).toContain('within the period')
      // No missed/late messages should be present
      expect(insights.length).toBe(1)
    })
  })
})
