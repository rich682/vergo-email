/**
 * Tests for Period Utilities
 */

import { describe, it, expect } from "vitest"
import {
  periodKeyFromDate,
  periodKeyFromValue,
  isValidPeriodKey,
  previousPeriodKey,
  samePeriodLastYearKey,
  labelForPeriodKey,
  getAvailablePeriods,
  resolveComparePeriod,
  type ReportCadence,
} from "@/lib/utils/period"

describe("Period Utilities", () => {
  // ============================================
  // periodKeyFromDate
  // ============================================
  describe("periodKeyFromDate", () => {
    const testDate = new Date(2026, 0, 28) // Jan 28, 2026

    it("generates daily period key", () => {
      expect(periodKeyFromDate(testDate, "daily")).toBe("2026-01-28")
    })

    it("generates monthly period key", () => {
      expect(periodKeyFromDate(testDate, "monthly")).toBe("2026-01")
    })

    it("generates quarterly period key for Q1", () => {
      expect(periodKeyFromDate(new Date(2026, 0, 15), "quarterly")).toBe("2026-Q1")
      expect(periodKeyFromDate(new Date(2026, 2, 31), "quarterly")).toBe("2026-Q1")
    })

    it("generates quarterly period key for Q2", () => {
      expect(periodKeyFromDate(new Date(2026, 3, 1), "quarterly")).toBe("2026-Q2")
      expect(periodKeyFromDate(new Date(2026, 5, 30), "quarterly")).toBe("2026-Q2")
    })

    it("generates quarterly period key for Q3", () => {
      expect(periodKeyFromDate(new Date(2026, 6, 1), "quarterly")).toBe("2026-Q3")
    })

    it("generates quarterly period key for Q4", () => {
      expect(periodKeyFromDate(new Date(2026, 9, 1), "quarterly")).toBe("2026-Q4")
      expect(periodKeyFromDate(new Date(2026, 11, 31), "quarterly")).toBe("2026-Q4")
    })

    it("generates annual period key", () => {
      expect(periodKeyFromDate(testDate, "annual")).toBe("2026")
    })
  })

  // ============================================
  // periodKeyFromValue
  // ============================================
  describe("periodKeyFromValue", () => {
    it("returns null for null/undefined", () => {
      expect(periodKeyFromValue(null, "monthly")).toBeNull()
      expect(periodKeyFromValue(undefined, "monthly")).toBeNull()
    })

    it("parses ISO date strings", () => {
      expect(periodKeyFromValue("2026-01-28", "monthly")).toBe("2026-01")
      expect(periodKeyFromValue("2026-01-28", "daily")).toBe("2026-01-28")
      expect(periodKeyFromValue("2026-01-28", "quarterly")).toBe("2026-Q1")
      expect(periodKeyFromValue("2026-01-28", "annual")).toBe("2026")
    })

    it("parses full ISO date strings with time", () => {
      expect(periodKeyFromValue("2026-01-28T10:30:00.000Z", "monthly")).toBe("2026-01")
    })

    it("parses YYYY-MM strings", () => {
      expect(periodKeyFromValue("2026-01", "monthly")).toBe("2026-01")
      expect(periodKeyFromValue("2026-03", "quarterly")).toBe("2026-Q1")
    })

    it("returns valid period key if already in correct format", () => {
      expect(periodKeyFromValue("2026-Q1", "quarterly")).toBe("2026-Q1")
      expect(periodKeyFromValue("2026", "annual")).toBe("2026")
    })

    it("parses Date objects", () => {
      const date = new Date(2026, 0, 28)
      expect(periodKeyFromValue(date, "monthly")).toBe("2026-01")
    })

    it("returns null for ambiguous strings without year", () => {
      expect(periodKeyFromValue("January", "monthly")).toBeNull()
      expect(periodKeyFromValue("Q1", "quarterly")).toBeNull()
    })

    it("returns null for invalid strings", () => {
      expect(periodKeyFromValue("not-a-date", "monthly")).toBeNull()
      expect(periodKeyFromValue("", "monthly")).toBeNull()
    })
  })

  // ============================================
  // isValidPeriodKey
  // ============================================
  describe("isValidPeriodKey", () => {
    it("validates daily period keys", () => {
      expect(isValidPeriodKey("2026-01-28", "daily")).toBe(true)
      expect(isValidPeriodKey("2026-02-29", "daily")).toBe(false) // 2026 not leap year
      expect(isValidPeriodKey("2024-02-29", "daily")).toBe(true) // 2024 is leap year
      expect(isValidPeriodKey("2026-13-01", "daily")).toBe(false)
      expect(isValidPeriodKey("2026-01", "daily")).toBe(false)
    })

    it("validates monthly period keys", () => {
      expect(isValidPeriodKey("2026-01", "monthly")).toBe(true)
      expect(isValidPeriodKey("2026-12", "monthly")).toBe(true)
      expect(isValidPeriodKey("2026-13", "monthly")).toBe(false)
      expect(isValidPeriodKey("2026-00", "monthly")).toBe(false)
      expect(isValidPeriodKey("2026", "monthly")).toBe(false)
    })

    it("validates quarterly period keys", () => {
      expect(isValidPeriodKey("2026-Q1", "quarterly")).toBe(true)
      expect(isValidPeriodKey("2026-Q4", "quarterly")).toBe(true)
      expect(isValidPeriodKey("2026-Q0", "quarterly")).toBe(false)
      expect(isValidPeriodKey("2026-Q5", "quarterly")).toBe(false)
      expect(isValidPeriodKey("2026-01", "quarterly")).toBe(false)
    })

    it("validates annual period keys", () => {
      expect(isValidPeriodKey("2026", "annual")).toBe(true)
      expect(isValidPeriodKey("1999", "annual")).toBe(true)
      expect(isValidPeriodKey("26", "annual")).toBe(false)
      expect(isValidPeriodKey("2026-01", "annual")).toBe(false)
    })
  })

  // ============================================
  // previousPeriodKey (MoM)
  // ============================================
  describe("previousPeriodKey", () => {
    it("handles daily periods", () => {
      expect(previousPeriodKey("2026-01-28", "daily")).toBe("2026-01-27")
      expect(previousPeriodKey("2026-01-01", "daily")).toBe("2025-12-31")
      expect(previousPeriodKey("2026-03-01", "daily")).toBe("2026-02-28")
    })

    it("handles monthly periods", () => {
      expect(previousPeriodKey("2026-01", "monthly")).toBe("2025-12")
      expect(previousPeriodKey("2026-06", "monthly")).toBe("2026-05")
      expect(previousPeriodKey("2026-12", "monthly")).toBe("2026-11")
    })

    it("handles quarterly periods", () => {
      expect(previousPeriodKey("2026-Q1", "quarterly")).toBe("2025-Q4")
      expect(previousPeriodKey("2026-Q2", "quarterly")).toBe("2026-Q1")
      expect(previousPeriodKey("2026-Q4", "quarterly")).toBe("2026-Q3")
    })

    it("handles annual periods", () => {
      expect(previousPeriodKey("2026", "annual")).toBe("2025")
      expect(previousPeriodKey("2000", "annual")).toBe("1999")
    })
  })

  // ============================================
  // samePeriodLastYearKey (YoY)
  // ============================================
  describe("samePeriodLastYearKey", () => {
    it("handles daily periods", () => {
      expect(samePeriodLastYearKey("2026-01-28")).toBe("2025-01-28")
      expect(samePeriodLastYearKey("2026-12-31")).toBe("2025-12-31")
    })

    it("handles monthly periods", () => {
      expect(samePeriodLastYearKey("2026-01")).toBe("2025-01")
      expect(samePeriodLastYearKey("2026-12")).toBe("2025-12")
    })

    it("handles quarterly periods", () => {
      expect(samePeriodLastYearKey("2026-Q1")).toBe("2025-Q1")
      expect(samePeriodLastYearKey("2026-Q4")).toBe("2025-Q4")
    })

    it("handles annual periods", () => {
      expect(samePeriodLastYearKey("2026")).toBe("2025")
    })
  })

  // ============================================
  // labelForPeriodKey
  // ============================================
  describe("labelForPeriodKey", () => {
    it("formats daily labels", () => {
      expect(labelForPeriodKey("2026-01-28", "daily")).toBe("Jan 28, 2026")
      expect(labelForPeriodKey("2026-12-01", "daily")).toBe("Dec 1, 2026")
    })

    it("formats monthly labels", () => {
      expect(labelForPeriodKey("2026-01", "monthly")).toBe("January 2026")
      expect(labelForPeriodKey("2026-12", "monthly")).toBe("December 2026")
    })

    it("formats quarterly labels", () => {
      expect(labelForPeriodKey("2026-Q1", "quarterly")).toBe("Q1 2026")
      expect(labelForPeriodKey("2026-Q4", "quarterly")).toBe("Q4 2026")
    })

    it("formats annual labels", () => {
      expect(labelForPeriodKey("2026", "annual")).toBe("2026")
    })
  })

  // ============================================
  // getAvailablePeriods
  // ============================================
  describe("getAvailablePeriods", () => {
    it("returns periods in descending order", () => {
      const periods = getAvailablePeriods("monthly", 3)
      expect(periods).toHaveLength(3)
      // First period should be current or recent
      expect(periods[0].key > periods[1].key).toBe(true)
      expect(periods[1].key > periods[2].key).toBe(true)
    })

    it("returns correct number of periods", () => {
      expect(getAvailablePeriods("monthly", 12)).toHaveLength(12)
      expect(getAvailablePeriods("quarterly", 8)).toHaveLength(8)
    })

    it("includes labels", () => {
      const periods = getAvailablePeriods("monthly", 1)
      expect(periods[0].label).toMatch(/^\w+ \d{4}$/)
    })
  })

  // ============================================
  // resolveComparePeriod
  // ============================================
  describe("resolveComparePeriod", () => {
    it("returns null for compareMode none", () => {
      expect(resolveComparePeriod("2026-01", "monthly", "none")).toBeNull()
    })

    it("returns previous period for MoM", () => {
      expect(resolveComparePeriod("2026-01", "monthly", "mom")).toBe("2025-12")
      expect(resolveComparePeriod("2026-Q1", "quarterly", "mom")).toBe("2025-Q4")
    })

    it("returns same period last year for YoY", () => {
      expect(resolveComparePeriod("2026-01", "monthly", "yoy")).toBe("2025-01")
      expect(resolveComparePeriod("2026-Q1", "quarterly", "yoy")).toBe("2025-Q1")
    })
  })
})
