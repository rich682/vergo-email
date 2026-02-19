import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
const mockFindFirst = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    board: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}))

vi.mock('@/lib/utils/openai-client', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}))

vi.mock('@/lib/utils/openai-retry', () => ({
  callOpenAI: vi.fn().mockRejectedValue(new Error('AI unavailable')),
}))

import { BoardSummaryService } from '@/lib/services/board-summary.service'

function makeBoard(overrides: Record<string, any> = {}) {
  return {
    id: 'board-1',
    name: 'January 2026',
    status: 'OPEN',
    cadence: 'MONTHLY',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-31'),
    closedAt: null,
    taskInstances: [],
    ...overrides,
  }
}

describe('BoardSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateDeterministicSummary', () => {
    const getDeterministic = (data: any) =>
      (BoardSummaryService as any).generateDeterministicSummary(data)

    it('should report completion percentage', () => {
      const bullets = getDeterministic({
        totalJobs: 10,
        completedJobs: 7,
        inProgressJobs: 2,
        highRiskRequests: 0,
        pendingRequests: 0,
        completedRequests: 0,
      })

      expect(bullets[0]).toContain('7 of 10')
      expect(bullets[0]).toContain('70%')
    })

    it('should report high-risk request count', () => {
      const bullets = getDeterministic({
        totalJobs: 5,
        completedJobs: 3,
        inProgressJobs: 1,
        highRiskRequests: 2,
        pendingRequests: 0,
        completedRequests: 0,
      })

      expect(bullets.some((b: string) => b.includes('2') && b.includes('high-risk'))).toBe(true)
    })

    it('should report pending request count', () => {
      const bullets = getDeterministic({
        totalJobs: 5,
        completedJobs: 3,
        inProgressJobs: 1,
        highRiskRequests: 0,
        pendingRequests: 4,
        completedRequests: 0,
      })

      expect(bullets.some((b: string) => b.includes('4') && b.includes('awaiting'))).toBe(true)
    })

    it('should return "No activity" for empty data', () => {
      const bullets = getDeterministic({
        totalJobs: 0,
        completedJobs: 0,
        inProgressJobs: 0,
        highRiskRequests: 0,
        pendingRequests: 0,
        completedRequests: 0,
      })

      expect(bullets[0]).toContain('No activity')
    })
  })

  describe('generateSummary — previous period context', () => {
    it('should include previous period context for MONTHLY boards', async () => {
      // First call: current board
      mockFindFirst.mockResolvedValueOnce(
        makeBoard({
          cadence: 'MONTHLY',
          taskInstances: [
            {
              id: 't1',
              name: 'Task A',
              status: 'IN_PROGRESS',
              dueDate: new Date('2026-01-20'),
              requests: [],
            },
          ],
        })
      )

      // Second call: previous period board
      mockFindFirst.mockResolvedValueOnce({
        name: 'December 2025',
        closedAt: new Date('2026-01-05'),
        periodEnd: new Date('2025-12-31'),
        periodStart: new Date('2025-12-01'),
        taskInstances: [
          {
            name: 'Task X',
            status: 'COMPLETE',
            dueDate: new Date('2025-12-20'),
            completedAt: new Date('2025-12-25'),
            updatedAt: new Date('2025-12-25'),
          },
        ],
      })

      const result = await BoardSummaryService.generateSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      // With AI mocked to fail, we get deterministic summary
      // The previous period query should have been called
      expect(mockFindFirst).toHaveBeenCalledTimes(2)
      expect(result.summaryBullets.length).toBeGreaterThan(0)
    })

    it('should skip previous period for non-MONTHLY boards', async () => {
      mockFindFirst.mockResolvedValueOnce(
        makeBoard({
          cadence: 'WEEKLY',
          taskInstances: [
            {
              id: 't1',
              name: 'Task A',
              status: 'COMPLETE',
              dueDate: null,
              requests: [],
            },
          ],
        })
      )

      await BoardSummaryService.generateSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      // Only one call — no previous period query for WEEKLY
      expect(mockFindFirst).toHaveBeenCalledTimes(1)
    })

    it('should handle null previous board gracefully', async () => {
      mockFindFirst.mockResolvedValueOnce(
        makeBoard({
          cadence: 'MONTHLY',
          taskInstances: [
            {
              id: 't1',
              name: 'Task A',
              status: 'IN_PROGRESS',
              dueDate: null,
              requests: [],
            },
          ],
        })
      )

      // No previous board found
      mockFindFirst.mockResolvedValueOnce(null)

      const result = await BoardSummaryService.generateSummary({
        boardId: 'board-1',
        organizationId: 'org-1',
      })

      expect(result.summaryBullets.length).toBeGreaterThan(0)
    })

    it('should throw "Board not found" for nonexistent board', async () => {
      mockFindFirst.mockResolvedValue(null)

      await expect(
        BoardSummaryService.generateSummary({
          boardId: 'bad-id',
          organizationId: 'org-1',
        })
      ).rejects.toThrow('Board not found')
    })
  })
})
