import { describe, it, expect } from 'vitest'
import { derivePeriodEnd, normalizePeriodStart } from '@/lib/services/board.service'

// Use local dates (year, month-1, day) to avoid UTC timezone parsing issues
// new Date('2026-03-01') is UTC midnight → could be Feb 28 in local time

describe('derivePeriodEnd', () => {
  it('should return endOfMonth for MONTHLY cadence', () => {
    const result = derivePeriodEnd('MONTHLY', new Date(2026, 2, 1)) // March 1
    expect(result).not.toBeNull()
    // End of March = March 31
    expect(result!.getDate()).toBe(31)
    expect(result!.getMonth()).toBe(2) // 0-indexed: March = 2
  })

  it('should return endOfWeek for WEEKLY cadence', () => {
    // 2026-01-05 is a Monday
    const result = derivePeriodEnd('WEEKLY', new Date(2026, 0, 5))
    expect(result).not.toBeNull()
    // End of week (Sunday) = Jan 11
    expect(result!.getDay()).toBe(0) // Sunday
  })

  it('should return endOfQuarter for QUARTERLY with default (Jan) FY start', () => {
    // Q1 start: Jan 1
    const result = derivePeriodEnd('QUARTERLY', new Date(2026, 0, 1))
    expect(result).not.toBeNull()
    // End of Q1 = March 31
    expect(result!.getMonth()).toBe(2) // March
    expect(result!.getDate()).toBe(31)
  })

  it('should calculate fiscal quarter end for non-Jan FY start', () => {
    // FY starts in April. Fiscal Q1 = Apr-Jun.
    const result = derivePeriodEnd('QUARTERLY', new Date(2026, 3, 1), { // April 1
      fiscalYearStartMonth: 4,
    })
    expect(result).not.toBeNull()
    // End of fiscal Q1 (Apr-Jun) = June 30
    expect(result!.getMonth()).toBe(5) // June = 5
    expect(result!.getDate()).toBe(30)
  })

  it('should return null for AD_HOC cadence', () => {
    const result = derivePeriodEnd('AD_HOC', new Date(2026, 0, 15))
    expect(result).toBeNull()
  })

  it('should return null when periodStart is null', () => {
    const result = derivePeriodEnd('MONTHLY', null)
    expect(result).toBeNull()
  })

  it('should return null when cadence is null', () => {
    const result = derivePeriodEnd(null, new Date(2026, 0, 1))
    expect(result).toBeNull()
  })
})

describe('normalizePeriodStart', () => {
  it('should normalize MONTHLY to first of month', () => {
    const result = normalizePeriodStart('MONTHLY', new Date(2026, 2, 15)) // March 15
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(1)
    expect(result!.getMonth()).toBe(2) // March
  })

  it('should normalize WEEKLY to Monday', () => {
    // 2026-01-07 is a Wednesday
    const result = normalizePeriodStart('WEEKLY', new Date(2026, 0, 7))
    expect(result).not.toBeNull()
    expect(result!.getDay()).toBe(1) // Monday
  })

  it('should return null for null inputs', () => {
    expect(normalizePeriodStart(null, new Date(2026, 0, 1))).toBeNull()
    expect(normalizePeriodStart('MONTHLY', null)).toBeNull()
  })
})
