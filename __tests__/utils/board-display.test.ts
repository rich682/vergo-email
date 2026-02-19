import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDaysUntilClose } from '@/lib/utils/board-display'

describe('getDaysUntilClose', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return null when periodEnd is null', () => {
    const result = getDaysUntilClose(null, '2026-01-01', false, null)
    expect(result).toBeNull()
  })

  it('should show "Closed in N days" with green + zap when closed before periodEnd', () => {
    const result = getDaysUntilClose(
      '2026-01-31', // periodEnd
      '2026-01-01', // periodStart
      true,          // isClosed
      '2026-01-25'  // closedAt — before periodEnd
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('Closed in 24 days')
    expect(result!.className).toContain('green')
    expect(result!.icon).toBe('zap')
  })

  it('should show "Closed N days late" with amber when closed after periodEnd', () => {
    const result = getDaysUntilClose(
      '2026-01-31', // periodEnd
      '2026-01-01', // periodStart
      true,          // isClosed
      '2026-02-05'  // closedAt — after periodEnd
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('Closed 5 days late')
    expect(result!.className).toContain('amber')
    expect(result!.icon).toBeNull()
  })

  it('should show "Closed" without detail when closed but no closedAt (legacy)', () => {
    const result = getDaysUntilClose(
      '2026-01-31',
      '2026-01-01',
      true,
      null // no closedAt
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('Closed')
    expect(result!.className).toContain('green')
  })

  it('should show "Overdue" in red when open and past periodEnd', () => {
    // Mock the current date to be after periodEnd
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-05'))

    const result = getDaysUntilClose(
      '2026-01-31',
      '2026-01-01',
      false,
      null
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('Overdue')
    expect(result!.className).toContain('red')

    vi.useRealTimers()
  })

  it('should show "Due today" when open and days === 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-31'))

    const result = getDaysUntilClose(
      '2026-01-31',
      '2026-01-01',
      false,
      null
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('Due today')
    expect(result!.className).toContain('orange')

    vi.useRealTimers()
  })

  it('should show "N days" in gray for future open boards', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15'))

    const result = getDaysUntilClose(
      '2026-01-31',
      '2026-01-01',
      false,
      null
    )

    expect(result).not.toBeNull()
    expect(result!.text).toBe('16 days')
    expect(result!.className).toContain('gray')

    vi.useRealTimers()
  })
})
