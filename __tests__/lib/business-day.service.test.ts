import { describe, it, expect } from "vitest"
import { BusinessDayService, ScheduleConfig } from "@/lib/services/business-day.service"

// Helper to create dates in local timezone to avoid UTC/local issues
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0) // Noon to avoid DST issues
}

describe("BusinessDayService", () => {
  describe("isWeekend", () => {
    it("should return true for Saturday", () => {
      const saturday = localDate(2025, 1, 25) // Saturday
      expect(BusinessDayService.isWeekend(saturday)).toBe(true)
    })

    it("should return true for Sunday", () => {
      const sunday = localDate(2025, 1, 26) // Sunday
      expect(BusinessDayService.isWeekend(sunday)).toBe(true)
    })

    it("should return false for weekdays", () => {
      const monday = localDate(2025, 1, 27) // Monday
      const friday = localDate(2025, 1, 31) // Friday
      expect(BusinessDayService.isWeekend(monday)).toBe(false)
      expect(BusinessDayService.isWeekend(friday)).toBe(false)
    })
  })

  describe("isBusinessDay", () => {
    it("should return true for weekdays", () => {
      const wednesday = localDate(2025, 1, 29) // Wednesday
      expect(BusinessDayService.isBusinessDay(wednesday)).toBe(true)
    })

    it("should return false for weekends", () => {
      const saturday = localDate(2025, 1, 25) // Saturday
      expect(BusinessDayService.isBusinessDay(saturday)).toBe(false)
    })
  })

  describe("getNextBusinessDay", () => {
    it("should return same day if already a business day", () => {
      const monday = localDate(2025, 1, 27)
      const result = BusinessDayService.getNextBusinessDay(monday)
      expect(result.getDate()).toBe(27)
    })

    it("should return Monday for Saturday", () => {
      const saturday = localDate(2025, 1, 25)
      const result = BusinessDayService.getNextBusinessDay(saturday)
      expect(result.getDate()).toBe(27) // Monday
    })

    it("should return Monday for Sunday", () => {
      const sunday = localDate(2025, 1, 26)
      const result = BusinessDayService.getNextBusinessDay(sunday)
      expect(result.getDate()).toBe(27) // Monday
    })
  })

  describe("getPreviousBusinessDay", () => {
    it("should return same day if already a business day", () => {
      const wednesday = localDate(2025, 1, 29)
      const result = BusinessDayService.getPreviousBusinessDay(wednesday)
      expect(result.getDate()).toBe(29)
    })

    it("should return Friday for Saturday", () => {
      const saturday = localDate(2025, 1, 25)
      const result = BusinessDayService.getPreviousBusinessDay(saturday)
      expect(result.getDate()).toBe(24) // Friday
    })

    it("should return Friday for Sunday", () => {
      const sunday = localDate(2025, 1, 26)
      const result = BusinessDayService.getPreviousBusinessDay(sunday)
      expect(result.getDate()).toBe(24) // Friday
    })
  })

  describe("addBusinessDays", () => {
    it("should add business days correctly", () => {
      const monday = localDate(2025, 1, 27) // Monday
      const result = BusinessDayService.addBusinessDays(monday, 5)
      // Monday + 5 business days = next Monday (Feb 3)
      expect(result.getMonth()).toBe(1) // February (0-indexed)
      expect(result.getDate()).toBe(3)
    })

    it("should skip weekends when adding days", () => {
      const thursday = localDate(2025, 1, 30) // Thursday
      const result = BusinessDayService.addBusinessDays(thursday, 2)
      // Thursday + 2 business days (Fri, then skip Sat/Sun, Mon) = Monday Feb 3
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(3)
    })

    it("should subtract business days correctly", () => {
      const wednesday = localDate(2025, 1, 29) // Wednesday
      const result = BusinessDayService.addBusinessDays(wednesday, -2)
      // Wednesday - 2 business days = Monday
      expect(result.getDate()).toBe(27)
    })

    it("should skip weekends when subtracting days", () => {
      const monday = localDate(2025, 1, 27) // Monday
      const result = BusinessDayService.addBusinessDays(monday, -1)
      // Monday - 1 business day (skip Sat/Sun) = Friday
      expect(result.getDate()).toBe(24)
    })

    it("should handle zero days", () => {
      const wednesday = localDate(2025, 1, 29)
      const result = BusinessDayService.addBusinessDays(wednesday, 0)
      expect(result.getDate()).toBe(29)
    })
  })

  describe("parseTime", () => {
    it("should parse valid time string", () => {
      const result = BusinessDayService.parseTime("14:30")
      expect(result.hours).toBe(14)
      expect(result.minutes).toBe(30)
    })

    it("should handle single digit hours", () => {
      const result = BusinessDayService.parseTime("9:00")
      expect(result.hours).toBe(9)
      expect(result.minutes).toBe(0)
    })

    it("should default to 9:00 for invalid input", () => {
      const result = BusinessDayService.parseTime("invalid")
      expect(result.hours).toBe(9)
      expect(result.minutes).toBe(0)
    })
  })

  describe("setTime", () => {
    it("should set time on date", () => {
      const date = localDate(2025, 1, 27)
      const result = BusinessDayService.setTime(date, "14:30")
      expect(result.getHours()).toBe(14)
      expect(result.getMinutes()).toBe(30)
      expect(result.getSeconds()).toBe(0)
    })
  })

  describe("computeScheduledDate", () => {
    it("should compute date for 15 business days before period end", () => {
      // Period end: Jan 31, 2025 (Friday)
      // 15 business days before = Jan 10, 2025 (Friday)
      const periodEnd = localDate(2025, 1, 31)
      const result = BusinessDayService.computeScheduledDate({
        anchor: periodEnd,
        offsetDays: -15,
        weekendRule: "previous",
        sendTime: "09:00"
      })
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(0) // January
      expect(result.getDate()).toBe(10)
      expect(result.getHours()).toBe(9)
      expect(result.getMinutes()).toBe(0)
    })

    it("should apply previous weekend rule", () => {
      // Anchor: Monday Jan 27
      // +5 business days = Monday Feb 3
      const anchor = localDate(2025, 1, 27)
      const result = BusinessDayService.computeScheduledDate({
        anchor,
        offsetDays: 5,
        weekendRule: "previous",
        sendTime: "09:00"
      })
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(3)
    })

    it("should apply next weekend rule when anchor is on weekend", () => {
      // Start from Saturday with 0 offset
      const saturday = localDate(2025, 1, 25)
      const result = BusinessDayService.computeScheduledDate({
        anchor: saturday,
        offsetDays: 0,
        weekendRule: "next",
        sendTime: "10:00"
      })
      // Should move to Monday
      expect(result.getDate()).toBe(27) // Monday
    })
  })

  describe("computeFromConfig", () => {
    it("should return null for ad_hoc mode", () => {
      const config: ScheduleConfig = { mode: "ad_hoc" }
      const result = BusinessDayService.computeFromConfig(config, localDate(2025, 1, 1), localDate(2025, 1, 31))
      expect(result).toBeNull()
    })

    it("should return null for null config", () => {
      const result = BusinessDayService.computeFromConfig(null, localDate(2025, 1, 1), localDate(2025, 1, 31))
      expect(result).toBeNull()
    })

    it("should return null if anchor date is missing", () => {
      const config: ScheduleConfig = { mode: "period_aware", anchor: "period_end" }
      const result = BusinessDayService.computeFromConfig(config, localDate(2025, 1, 1), null)
      expect(result).toBeNull()
    })

    it("should compute from period_end anchor", () => {
      const config: ScheduleConfig = {
        mode: "period_aware",
        anchor: "period_end",
        offsetDays: -5,
        weekendRule: "previous",
        sendTime: "09:00"
      }
      const periodStart = localDate(2025, 1, 1)
      const periodEnd = localDate(2025, 1, 31)
      const result = BusinessDayService.computeFromConfig(config, periodStart, periodEnd)
      expect(result).not.toBeNull()
      // Jan 31 - 5 business days = Jan 24 (Friday)
      expect(result?.getDate()).toBe(24)
    })

    it("should compute from period_start anchor", () => {
      const config: ScheduleConfig = {
        mode: "period_aware",
        anchor: "period_start",
        offsetDays: 5,
        weekendRule: "next",
        sendTime: "14:00"
      }
      const periodStart = localDate(2025, 1, 1) // Wednesday
      const periodEnd = localDate(2025, 1, 31)
      const result = BusinessDayService.computeFromConfig(config, periodStart, periodEnd)
      expect(result).not.toBeNull()
      // Jan 1 (Wed) + 5 business days = Jan 8 (Wed)
      expect(result?.getDate()).toBe(8)
      expect(result?.getHours()).toBe(14)
    })

    it("should use default values when not provided", () => {
      const config: ScheduleConfig = {
        mode: "period_aware"
        // No anchor, offsetDays, weekendRule, sendTime provided
      }
      const periodEnd = localDate(2025, 1, 31)
      const result = BusinessDayService.computeFromConfig(config, null, periodEnd)
      expect(result).not.toBeNull()
      // Default: anchor=period_end, offset=0, weekendRule=previous, sendTime=09:00
      expect(result?.getDate()).toBe(31)
      expect(result?.getHours()).toBe(9)
    })
  })

  describe("validateConfig", () => {
    it("should pass for valid ad_hoc config", () => {
      const errors = BusinessDayService.validateConfig({ mode: "ad_hoc" })
      expect(errors).toHaveLength(0)
    })

    it("should pass for valid period_aware config", () => {
      const errors = BusinessDayService.validateConfig({
        mode: "period_aware",
        anchor: "period_end",
        offsetDays: -15,
        weekendRule: "previous",
        sendTime: "09:00"
      })
      expect(errors).toHaveLength(0)
    })

    it("should fail for invalid mode", () => {
      const errors = BusinessDayService.validateConfig({ mode: "invalid" })
      expect(errors).toContain("mode must be 'ad_hoc' or 'period_aware'")
    })

    it("should fail for invalid anchor", () => {
      const errors = BusinessDayService.validateConfig({
        mode: "period_aware",
        anchor: "invalid"
      })
      expect(errors).toContain("anchor must be 'period_start' or 'period_end'")
    })

    it("should fail for non-number offsetDays", () => {
      const errors = BusinessDayService.validateConfig({
        mode: "period_aware",
        offsetDays: "five" as any
      })
      expect(errors).toContain("offsetDays must be a number")
    })

    it("should fail for invalid weekendRule", () => {
      const errors = BusinessDayService.validateConfig({
        mode: "period_aware",
        weekendRule: "skip" as any
      })
      expect(errors).toContain("weekendRule must be 'previous' or 'next'")
    })

    it("should fail for invalid sendTime format", () => {
      const errors = BusinessDayService.validateConfig({
        mode: "period_aware",
        sendTime: "9am"
      })
      expect(errors).toContain("sendTime must be in HH:mm format (24-hour)")
    })

    it("should pass for valid sendTime formats", () => {
      expect(BusinessDayService.validateConfig({
        mode: "period_aware",
        sendTime: "09:00"
      })).toHaveLength(0)
      
      expect(BusinessDayService.validateConfig({
        mode: "period_aware",
        sendTime: "23:59"
      })).toHaveLength(0)
    })
  })
})
