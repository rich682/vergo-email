/**
 * Tests for Timezone Utilities
 */

import { describe, it, expect } from "vitest"
import {
  parseDateOnly,
  parseDateOnlySafe,
  formatDateOnly,
  formatDateOnlyRange,
  generatePeriodBoardName,
  calculateNextPeriodStart,
  calculatePreviousPeriodStart,
  getEndOfPeriod,
  formatPeriodDisplay,
  isTimezoneConfigured,
} from "@/lib/utils/timezone"

// Helper: create a UTC midnight date (simulating what Prisma stores)
function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

// ============================================
// parseDateOnly
// ============================================
describe("parseDateOnly", () => {
  it("parses ISO string without timezone shift", () => {
    const date = parseDateOnly("2026-01-31T00:00:00.000Z")
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0) // January
    expect(date.getDate()).toBe(31)
  })

  it("parses date-only string", () => {
    const date = parseDateOnly("2026-03-15")
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2) // March
    expect(date.getDate()).toBe(15)
  })

  it("handles year boundaries correctly", () => {
    // This is the critical bug scenario: Jan 1 UTC midnight in US timezone
    const date = parseDateOnly("2026-01-01T00:00:00.000Z")
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0) // January, NOT December of previous year
    expect(date.getDate()).toBe(1)
  })

  it("handles Dec 31 correctly", () => {
    const date = parseDateOnly("2025-12-31T00:00:00.000Z")
    expect(date.getFullYear()).toBe(2025)
    expect(date.getMonth()).toBe(11)
    expect(date.getDate()).toBe(31)
  })

  it("handles February dates", () => {
    const date = parseDateOnly("2026-02-28T00:00:00.000Z")
    expect(date.getDate()).toBe(28)
    expect(date.getMonth()).toBe(1)
  })

  it("handles leap year February 29", () => {
    const date = parseDateOnly("2024-02-29T00:00:00.000Z")
    expect(date.getDate()).toBe(29)
    expect(date.getMonth()).toBe(1)
  })
})

// ============================================
// parseDateOnlySafe
// ============================================
describe("parseDateOnlySafe", () => {
  it("returns null for null/undefined", () => {
    expect(parseDateOnlySafe(null)).toBeNull()
    expect(parseDateOnlySafe(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseDateOnlySafe("")).toBeNull()
  })

  it("returns null for invalid strings", () => {
    expect(parseDateOnlySafe("not-a-date")).toBeNull()
    expect(parseDateOnlySafe("abc-de-fg")).toBeNull()
  })

  it("parses valid ISO strings", () => {
    const result = parseDateOnlySafe("2026-03-15T00:00:00.000Z")
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(15)
  })

  it("parses date-only strings", () => {
    const result = parseDateOnlySafe("2026-06-01")
    expect(result).not.toBeNull()
    expect(result!.getMonth()).toBe(5)
    expect(result!.getDate()).toBe(1)
  })
})

// ============================================
// formatDateOnly
// ============================================
describe("formatDateOnly", () => {
  it("formats date with default format", () => {
    expect(formatDateOnly("2026-01-31T00:00:00.000Z")).toBe("Jan 31, 2026")
  })

  it("formats with custom format string", () => {
    expect(formatDateOnly("2026-01-31T00:00:00.000Z", "MMMM yyyy")).toBe("January 2026")
  })

  it("returns em dash for null/undefined", () => {
    expect(formatDateOnly(null)).toBe("—")
    expect(formatDateOnly(undefined)).toBe("—")
  })

  it("handles year boundary correctly (Jan 1)", () => {
    expect(formatDateOnly("2026-01-01T00:00:00.000Z")).toBe("Jan 1, 2026")
  })

  it("formats December 31 correctly", () => {
    expect(formatDateOnly("2025-12-31T00:00:00.000Z")).toBe("Dec 31, 2025")
  })
})

// ============================================
// formatDateOnlyRange
// ============================================
describe("formatDateOnlyRange", () => {
  it("formats a date range", () => {
    const result = formatDateOnlyRange(
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T00:00:00.000Z"
    )
    expect(result).toBe("Jan 1, 2026 - Jan 31, 2026")
  })

  it("returns em dash for null start", () => {
    expect(formatDateOnlyRange(null, "2026-01-31T00:00:00.000Z")).toBe("—")
  })

  it("returns just start when end is null", () => {
    expect(formatDateOnlyRange("2026-01-01T00:00:00.000Z", null)).toBe("Jan 1, 2026")
  })

  it("formats with custom format", () => {
    const result = formatDateOnlyRange(
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "MM/dd/yyyy"
    )
    expect(result).toBe("03/01/2026 - 03/31/2026")
  })
})

// ============================================
// isTimezoneConfigured
// ============================================
describe("isTimezoneConfigured", () => {
  it("returns false for null/undefined", () => {
    expect(isTimezoneConfigured(null)).toBe(false)
    expect(isTimezoneConfigured(undefined)).toBe(false)
  })

  it("returns false for UTC (default)", () => {
    expect(isTimezoneConfigured("UTC")).toBe(false)
  })

  it("returns true for non-UTC timezones", () => {
    expect(isTimezoneConfigured("America/New_York")).toBe(true)
    expect(isTimezoneConfigured("America/Los_Angeles")).toBe(true)
    expect(isTimezoneConfigured("Europe/London")).toBe(true)
  })

  it("returns false for empty string", () => {
    expect(isTimezoneConfigured("")).toBe(false)
  })
})

// ============================================
// generatePeriodBoardName
// ============================================
describe("generatePeriodBoardName", () => {
  const tz = "America/New_York"

  it("generates DAILY board name", () => {
    const date = utcMidnight(2026, 1, 15) // Jan 15
    expect(generatePeriodBoardName("DAILY", date, tz)).toBe("Jan 15, 2026")
  })

  it("generates WEEKLY board name", () => {
    const date = utcMidnight(2026, 3, 2) // Mar 2
    expect(generatePeriodBoardName("WEEKLY", date, tz)).toBe("Week of Mar 2, 2026")
  })

  it("generates MONTHLY board name", () => {
    const date = utcMidnight(2026, 1, 1)
    expect(generatePeriodBoardName("MONTHLY", date, tz)).toBe("January 2026")
  })

  it("generates MONTHLY board name for December", () => {
    const date = utcMidnight(2026, 12, 1)
    expect(generatePeriodBoardName("MONTHLY", date, tz)).toBe("December 2026")
  })

  it("generates QUARTERLY board name (calendar year)", () => {
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 1, 1), tz)).toBe("Q1 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 4, 1), tz)).toBe("Q2 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 7, 1), tz)).toBe("Q3 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 10, 1), tz)).toBe("Q4 2026")
  })

  it("generates QUARTERLY board name with fiscal year offset", () => {
    // Fiscal year starts in April (month 4)
    const opts = { fiscalYearStartMonth: 4 }
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 4, 1), tz, opts)).toBe("Q1 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 7, 1), tz, opts)).toBe("Q2 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 10, 1), tz, opts)).toBe("Q3 2026")
    expect(generatePeriodBoardName("QUARTERLY", utcMidnight(2026, 1, 1), tz, opts)).toBe("Q4 2026")
  })

  it("generates YEAR_END board name", () => {
    const date = utcMidnight(2026, 1, 1)
    expect(generatePeriodBoardName("YEAR_END", date, tz)).toBe("Year-End 2026")
  })

  it("returns empty string for AD_HOC", () => {
    expect(generatePeriodBoardName("AD_HOC", utcMidnight(2026, 1, 1), tz)).toBe("")
  })

  it("handles year boundary (Jan 1 UTC midnight) correctly", () => {
    // This was a real bug — Jan 1 UTC midnight shifts to Dec 31 in US timezones
    const date = utcMidnight(2026, 1, 1)
    const name = generatePeriodBoardName("MONTHLY", date, tz)
    expect(name).toBe("January 2026")
    expect(name).not.toContain("December")
    expect(name).not.toContain("2025")
  })
})

// ============================================
// calculateNextPeriodStart
// ============================================
describe("calculateNextPeriodStart", () => {
  const tz = "America/New_York"

  it("returns null for null cadence", () => {
    expect(calculateNextPeriodStart(null, utcMidnight(2026, 1, 1), tz)).toBeNull()
  })

  it("returns null for null period start", () => {
    expect(calculateNextPeriodStart("MONTHLY", null, tz)).toBeNull()
  })

  it("returns null for AD_HOC cadence", () => {
    expect(calculateNextPeriodStart("AD_HOC", utcMidnight(2026, 1, 1), tz)).toBeNull()
  })

  describe("DAILY", () => {
    it("advances to next weekday", () => {
      // Wednesday Jan 14, 2026 → Thursday Jan 15
      const result = calculateNextPeriodStart("DAILY", utcMidnight(2026, 1, 14), tz)
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(15)
    })

    it("skips weekends by default", () => {
      // Friday Jan 16, 2026 → Monday Jan 19
      const result = calculateNextPeriodStart("DAILY", utcMidnight(2026, 1, 16), tz)
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(19)
      expect(result!.getDay()).toBe(1) // Monday
    })

    it("does not skip weekends when option is false", () => {
      // Friday Jan 16, 2026 → Saturday Jan 17
      const result = calculateNextPeriodStart("DAILY", utcMidnight(2026, 1, 16), tz, { skipWeekends: false })
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(17)
    })
  })

  describe("WEEKLY", () => {
    it("advances to next Monday", () => {
      const result = calculateNextPeriodStart("WEEKLY", utcMidnight(2026, 1, 5), tz)
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(12)
      expect(result!.getMonth()).toBe(0) // January
    })
  })

  describe("MONTHLY", () => {
    it("advances to next month", () => {
      const result = calculateNextPeriodStart("MONTHLY", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(1) // February
      expect(result!.getDate()).toBe(1)
    })

    it("wraps year boundary (Dec → Jan)", () => {
      const result = calculateNextPeriodStart("MONTHLY", utcMidnight(2025, 12, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2026)
      expect(result!.getMonth()).toBe(0) // January
    })

    it("handles Jan 1 UTC midnight without timezone shift", () => {
      // Regression test: Jan 1 UTC midnight must stay Jan, not shift to Dec
      const result = calculateNextPeriodStart("MONTHLY", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(1) // February, not January (which would happen if Jan shifted to Dec)
    })
  })

  describe("QUARTERLY", () => {
    it("advances Q1 to Q2 (calendar year)", () => {
      const result = calculateNextPeriodStart("QUARTERLY", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(3) // April
      expect(result!.getDate()).toBe(1)
    })

    it("advances Q4 to next year Q1", () => {
      const result = calculateNextPeriodStart("QUARTERLY", utcMidnight(2026, 10, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2027)
      expect(result!.getMonth()).toBe(0) // January
    })

    it("handles fiscal year offset (April start)", () => {
      const opts = { fiscalYearStartMonth: 4 }
      const result = calculateNextPeriodStart("QUARTERLY", utcMidnight(2026, 4, 1), tz, opts)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(6) // July
    })
  })

  describe("YEAR_END", () => {
    it("advances to next year", () => {
      const result = calculateNextPeriodStart("YEAR_END", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2027)
      expect(result!.getMonth()).toBe(0)
    })

    it("handles fiscal year offset", () => {
      const opts = { fiscalYearStartMonth: 7 }
      const result = calculateNextPeriodStart("YEAR_END", utcMidnight(2026, 7, 1), tz, opts)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2027)
      expect(result!.getMonth()).toBe(6) // July
    })
  })
})

// ============================================
// calculatePreviousPeriodStart
// ============================================
describe("calculatePreviousPeriodStart", () => {
  const tz = "America/New_York"

  it("returns null for null cadence", () => {
    expect(calculatePreviousPeriodStart(null, utcMidnight(2026, 1, 1), tz)).toBeNull()
  })

  it("returns null for AD_HOC", () => {
    expect(calculatePreviousPeriodStart("AD_HOC", utcMidnight(2026, 1, 1), tz)).toBeNull()
  })

  describe("DAILY", () => {
    it("goes back one weekday", () => {
      // Wednesday → Tuesday
      const result = calculatePreviousPeriodStart("DAILY", utcMidnight(2026, 1, 14), tz)
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(13)
    })

    it("skips weekends going backward (Monday → Friday)", () => {
      // Monday Jan 12 → Friday Jan 9
      const result = calculatePreviousPeriodStart("DAILY", utcMidnight(2026, 1, 12), tz)
      expect(result).not.toBeNull()
      expect(result!.getDate()).toBe(9)
      expect(result!.getDay()).toBe(5) // Friday
    })
  })

  describe("MONTHLY", () => {
    it("goes back one month", () => {
      const result = calculatePreviousPeriodStart("MONTHLY", utcMidnight(2026, 3, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(1) // February
    })

    it("wraps year boundary (Jan → Dec)", () => {
      const result = calculatePreviousPeriodStart("MONTHLY", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2025)
      expect(result!.getMonth()).toBe(11) // December
    })
  })

  describe("QUARTERLY", () => {
    it("goes back one quarter", () => {
      const result = calculatePreviousPeriodStart("QUARTERLY", utcMidnight(2026, 4, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(0) // January
    })

    it("wraps year boundary (Q1 → previous Q4)", () => {
      const result = calculatePreviousPeriodStart("QUARTERLY", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2025)
      expect(result!.getMonth()).toBe(9) // October
    })
  })

  describe("YEAR_END", () => {
    it("goes back one year", () => {
      const result = calculatePreviousPeriodStart("YEAR_END", utcMidnight(2026, 1, 1), tz)
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2025)
    })
  })
})

// ============================================
// getEndOfPeriod
// ============================================
describe("getEndOfPeriod", () => {
  const tz = "America/New_York"

  it("returns null for null period start", () => {
    expect(getEndOfPeriod("MONTHLY", null as any, tz)).toBeNull()
  })

  it("returns null for AD_HOC", () => {
    expect(getEndOfPeriod("AD_HOC", utcMidnight(2026, 1, 1), tz)).toBeNull()
  })

  it("returns end of day for DAILY", () => {
    const result = getEndOfPeriod("DAILY", utcMidnight(2026, 1, 15), tz)
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(15)
    expect(result!.getHours()).toBe(23)
    expect(result!.getMinutes()).toBe(59)
  })

  it("returns end of month for MONTHLY", () => {
    const result = getEndOfPeriod("MONTHLY", utcMidnight(2026, 1, 1), tz)
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(31) // January has 31 days
  })

  it("returns end of February correctly (non-leap)", () => {
    const result = getEndOfPeriod("MONTHLY", utcMidnight(2026, 2, 1), tz)
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(28)
  })

  it("returns end of February correctly (leap year)", () => {
    const result = getEndOfPeriod("MONTHLY", utcMidnight(2024, 2, 1), tz)
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(29)
  })

  it("returns end of quarter for QUARTERLY", () => {
    const result = getEndOfPeriod("QUARTERLY", utcMidnight(2026, 1, 1), tz)
    expect(result).not.toBeNull()
    expect(result!.getMonth()).toBe(2) // March
    expect(result!.getDate()).toBe(31)
  })

  it("returns end of year for YEAR_END", () => {
    const result = getEndOfPeriod("YEAR_END", utcMidnight(2026, 1, 1), tz)
    expect(result).not.toBeNull()
    expect(result!.getMonth()).toBe(11) // December
    expect(result!.getDate()).toBe(31)
  })

  it("handles fiscal year QUARTERLY end (3 months)", () => {
    const opts = { fiscalYearStartMonth: 4 }
    const result = getEndOfPeriod("QUARTERLY", utcMidnight(2026, 4, 1), tz, opts)
    expect(result).not.toBeNull()
    // April + 3 months - 1 day = June 30
    expect(result!.getMonth()).toBe(5) // June
    expect(result!.getDate()).toBe(30)
  })

  it("handles fiscal year YEAR_END end (12 months)", () => {
    const opts = { fiscalYearStartMonth: 7 }
    const result = getEndOfPeriod("YEAR_END", utcMidnight(2026, 7, 1), tz, opts)
    expect(result).not.toBeNull()
    // July + 12 months - 1 day = June 30
    expect(result!.getMonth()).toBe(5) // June
    expect(result!.getDate()).toBe(30)
  })
})

// ============================================
// formatPeriodDisplay
// ============================================
describe("formatPeriodDisplay", () => {
  const tz = "America/New_York"

  it("returns em dash for null period start", () => {
    expect(formatPeriodDisplay(null, null, "MONTHLY", tz)).toBe("—")
  })

  it("formats MONTHLY period", () => {
    expect(formatPeriodDisplay("2026-01-01T00:00:00.000Z", null, "MONTHLY", tz)).toBe("January 2026")
  })

  it("formats WEEKLY period", () => {
    expect(formatPeriodDisplay("2026-03-02T00:00:00.000Z", null, "WEEKLY", tz)).toBe("Week of Mar 2, 2026")
  })

  it("formats QUARTERLY period", () => {
    expect(formatPeriodDisplay("2026-01-01T00:00:00.000Z", null, "QUARTERLY", tz)).toBe("Q1 2026")
    expect(formatPeriodDisplay("2026-04-01T00:00:00.000Z", null, "QUARTERLY", tz)).toBe("Q2 2026")
    expect(formatPeriodDisplay("2026-07-01T00:00:00.000Z", null, "QUARTERLY", tz)).toBe("Q3 2026")
    expect(formatPeriodDisplay("2026-10-01T00:00:00.000Z", null, "QUARTERLY", tz)).toBe("Q4 2026")
  })

  it("formats YEAR_END period", () => {
    expect(formatPeriodDisplay("2026-01-01T00:00:00.000Z", null, "YEAR_END", tz)).toBe("2026")
  })

  it("formats DAILY period", () => {
    expect(formatPeriodDisplay("2026-01-15T00:00:00.000Z", null, "DAILY", tz)).toBe("Jan 15, 2026")
  })

  it("formats AD_HOC with date range", () => {
    const result = formatPeriodDisplay(
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T00:00:00.000Z",
      "AD_HOC",
      tz
    )
    expect(result).toBe("Jan 1 - Jan 31, 2026")
  })

  it("accepts Date objects as well as strings", () => {
    const date = new Date(2026, 0, 1) // Local Jan 1
    expect(formatPeriodDisplay(date, null, "MONTHLY", tz)).toBe("January 2026")
  })
})
