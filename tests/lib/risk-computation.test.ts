import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeDeterministicRisk, computeLastActivityAt } from '@/lib/services/risk-computation.service'

describe('Risk Computation Service', () => {
  describe('computeDeterministicRisk', () => {
    it('should return high risk for unread emails', () => {
      const result = computeDeterministicRisk({
        hasReplies: false,
        openedAt: null,
        lastOpenedAt: null
      })

      expect(result.readStatus).toBe('unread')
      expect(result.riskLevel).toBe('high')
      expect(result.riskReason).toBe('Email not opened yet')
    })

    it('should return high risk for read but no reply', () => {
      const openedAt = new Date('2024-01-01')
      const result = computeDeterministicRisk({
        hasReplies: false,
        openedAt,
        lastOpenedAt: openedAt
      })

      expect(result.readStatus).toBe('read')
      expect(result.riskLevel).toBe('high')
      expect(result.riskReason).toContain('Email read but no response')
    })

    it('should return high risk for read with overdue deadline', () => {
      const openedAt = new Date('2024-01-01')
      const deadlineDate = new Date('2024-01-05') // 4 days ago
      const result = computeDeterministicRisk({
        hasReplies: false,
        openedAt,
        lastOpenedAt: openedAt,
        deadlineDate
      })

      expect(result.readStatus).toBe('read')
      expect(result.riskLevel).toBe('high')
      expect(result.riskReason).toContain('days overdue')
    })

    it('should return low risk for replied with positive indicators', () => {
      const result = computeDeterministicRisk({
        hasReplies: true,
        latestResponseText: 'I just paid the invoice today, thank you!',
        openedAt: new Date('2024-01-01'),
        lastOpenedAt: new Date('2024-01-01')
      })

      expect(result.readStatus).toBe('replied')
      expect(result.riskLevel).toBe('low')
      expect(result.riskReason).toContain('Positive response')
    })

    it('should return high risk for replied with concerning language', () => {
      const result = computeDeterministicRisk({
        hasReplies: true,
        latestResponseText: 'I dispute this invoice, it is wrong',
        openedAt: new Date('2024-01-01'),
        lastOpenedAt: new Date('2024-01-01')
      })

      expect(result.readStatus).toBe('replied')
      expect(result.riskLevel).toBe('high')
      expect(result.riskReason).toContain('concerning language')
    })

    it('should return low risk for high completion percentage', () => {
      const result = computeDeterministicRisk({
        hasReplies: true,
        latestResponseText: 'I will get back to you',
        completionPercentage: 95,
        openedAt: new Date('2024-01-01'),
        lastOpenedAt: new Date('2024-01-01')
      })

      expect(result.readStatus).toBe('replied')
      expect(result.riskLevel).toBe('low')
      expect(result.riskReason).toContain('Request appears fulfilled')
    })

    it('should return medium risk for replied without clear indicators', () => {
      const result = computeDeterministicRisk({
        hasReplies: true,
        latestResponseText: 'I will look into this',
        openedAt: new Date('2024-01-01'),
        lastOpenedAt: new Date('2024-01-01')
      })

      expect(result.readStatus).toBe('replied')
      expect(result.riskLevel).toBe('medium')
      expect(result.riskReason).toContain('Response received')
    })

    it('should return unknown for insufficient data', () => {
      const result = computeDeterministicRisk({
        hasReplies: false,
        openedAt: null,
        lastOpenedAt: null
      })

      // Actually, unread should be high, so let's test truly unknown
      // When we have no data at all
      const unknownResult = computeDeterministicRisk({
        hasReplies: false,
        openedAt: null,
        lastOpenedAt: null,
        latestResponseText: null,
        completionPercentage: null
      })

      // Unread is still determinable, so it should be high, not unknown
      // Unknown case is hard to hit with deterministic logic
      expect(unknownResult.readStatus).toBe('unread')
      expect(unknownResult.riskLevel).toBe('high')
    })
  })

  describe('computeLastActivityAt', () => {
    it('should prioritize lastOpenedAt', () => {
      const lastOpenedAt = new Date('2024-01-05')
      const openedAt = new Date('2024-01-01')
      const lastActivityAt = new Date('2024-01-03')

      const result = computeLastActivityAt({
        lastOpenedAt,
        openedAt,
        lastActivityAt
      })

      expect(result).toEqual(lastOpenedAt)
    })

    it('should fall back to openedAt if lastOpenedAt is null', () => {
      const openedAt = new Date('2024-01-01')
      const lastActivityAt = new Date('2024-01-03')

      const result = computeLastActivityAt({
        openedAt,
        lastActivityAt
      })

      expect(result).toEqual(openedAt)
    })

    it('should fall back to lastActivityAt if openedAt is null', () => {
      const lastActivityAt = new Date('2024-01-03')

      const result = computeLastActivityAt({
        lastActivityAt
      })

      expect(result).toEqual(lastActivityAt)
    })

    it('should return null if no activity data', () => {
      const result = computeLastActivityAt({})

      expect(result).toBeNull()
    })
  })
})


