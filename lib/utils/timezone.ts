/**
 * Timezone Utilities
 * 
 * Centralized timezone-aware date operations for the application.
 * All date operations should use the organization's configured timezone.
 * 
 * IMPORTANT: Never default to "UTC" - always require timezone to be explicitly passed.
 */

import { formatInTimeZone, toZonedTime } from "date-fns-tz"
import { 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  startOfQuarter, 
  startOfYear,
  endOfDay,
  endOfWeek,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  isWeekend,
  nextMonday,
} from "date-fns"

// Board cadence types
type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"

/**
 * Check if a timezone is configured (not the default "UTC").
 * Organizations should explicitly set their timezone.
 */
export function isTimezoneConfigured(timezone: string | null | undefined): boolean {
  return !!timezone && timezone !== "UTC"
}

/**
 * Get today's date at midnight in the specified timezone.
 * Returns a Date object representing midnight in the org's timezone.
 */
export function getTodayInTimezone(timezone: string): Date {
  const now = new Date()
  const zonedNow = toZonedTime(now, timezone)
  return startOfDay(zonedNow)
}

/**
 * Get today's date as a YYYY-MM-DD string in the specified timezone.
 */
export function getTodayStringInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd")
}

/**
 * Normalize a date to midnight in the specified timezone.
 */
export function normalizeToMidnight(date: Date, timezone: string): Date {
  const zonedDate = toZonedTime(date, timezone)
  return startOfDay(zonedDate)
}

/**
 * Get the start of the current period based on cadence in the specified timezone.
 */
export function getStartOfPeriod(
  cadence: BoardCadence,
  timezone: string,
  options?: { fiscalYearStartMonth?: number }
): Date | null {
  const now = new Date()
  const zonedNow = toZonedTime(now, timezone)
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY":
      return startOfDay(zonedNow)
    case "WEEKLY":
      return startOfWeek(zonedNow, { weekStartsOn: 1 }) // Monday
    case "MONTHLY":
      return startOfMonth(zonedNow)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        return startOfQuarter(zonedNow)
      }
      // Fiscal quarter start calculation
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const currentMonth = zonedNow.getMonth()
      const monthsFromFiscalStart = (currentMonth - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      const quarterStartMonthOffset = fiscalQuarter * 3
      const quarterStartMonth = (fiscalMonthIndex + quarterStartMonthOffset) % 12
      let year = zonedNow.getFullYear()
      if (quarterStartMonth > currentMonth && currentMonth < fiscalMonthIndex) {
        year--
      }
      return new Date(year, quarterStartMonth, 1)
    }
    case "YEAR_END": {
      if (fiscalYearStartMonth === 1) {
        return startOfYear(zonedNow)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const currentMonth = zonedNow.getMonth()
      let year = zonedNow.getFullYear()
      if (currentMonth < fiscalMonthIndex) {
        year--
      }
      return new Date(year, fiscalMonthIndex, 1)
    }
    case "AD_HOC":
      return null
    default:
      return null
  }
}

/**
 * Get the end of a period based on the period start and cadence.
 */
export function getEndOfPeriod(
  cadence: BoardCadence,
  periodStart: Date,
  timezone: string,
  options?: { fiscalYearStartMonth?: number }
): Date | null {
  if (!periodStart) return null

  const zonedStart = toZonedTime(periodStart, timezone)
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY":
      return endOfDay(zonedStart)
    case "WEEKLY":
      return endOfWeek(zonedStart, { weekStartsOn: 1 })
    case "MONTHLY":
      return endOfMonth(zonedStart)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        return endOfQuarter(zonedStart)
      }
      // Fiscal quarter end: 3 months after start, minus 1 day
      const quarterEnd = addMonths(zonedStart, 3)
      return addDays(quarterEnd, -1)
    }
    case "YEAR_END": {
      if (fiscalYearStartMonth === 1) {
        return endOfYear(zonedStart)
      }
      // Fiscal year end: 12 months after start, minus 1 day
      const yearEnd = addMonths(zonedStart, 12)
      return addDays(yearEnd, -1)
    }
    case "AD_HOC":
      return null
    default:
      return null
  }
}

/**
 * Calculate the next period start date based on cadence.
 */
export function calculateNextPeriodStart(
  cadence: BoardCadence,
  currentPeriodStart: Date,
  timezone: string,
  options?: { skipWeekends?: boolean; fiscalYearStartMonth?: number }
): Date | null {
  if (!currentPeriodStart || cadence === "AD_HOC") return null

  const zonedCurrent = toZonedTime(currentPeriodStart, timezone)
  const skipWeekends = options?.skipWeekends ?? true
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY": {
      let nextDate = addDays(zonedCurrent, 1)
      if (skipWeekends && isWeekend(nextDate)) {
        nextDate = nextMonday(nextDate)
      }
      return nextDate
    }
    case "WEEKLY":
      return addWeeks(startOfWeek(zonedCurrent, { weekStartsOn: 1 }), 1)
    case "MONTHLY":
      return addMonths(startOfMonth(zonedCurrent), 1)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        const quarterMonth = Math.floor(zonedCurrent.getMonth() / 3) * 3
        const currentQuarterStart = new Date(zonedCurrent.getFullYear(), quarterMonth, 1)
        return addMonths(currentQuarterStart, 3)
      }
      // Fiscal quarters
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const monthsFromFiscalStart = (zonedCurrent.getMonth() - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      const quarterStartMonthOffset = fiscalQuarter * 3
      const currentFiscalQuarterStartMonth = (fiscalMonthIndex + quarterStartMonthOffset) % 12
      let year = zonedCurrent.getFullYear()
      if (currentFiscalQuarterStartMonth > zonedCurrent.getMonth() && zonedCurrent.getMonth() < fiscalMonthIndex) {
        year--
      }
      const currentFiscalQuarterStart = new Date(year, currentFiscalQuarterStartMonth, 1)
      return addMonths(currentFiscalQuarterStart, 3)
    }
    case "YEAR_END": {
      const currentYear = zonedCurrent.getFullYear()
      if (fiscalYearStartMonth === 1) {
        return new Date(currentYear + 1, 0, 1)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      if (zonedCurrent.getMonth() >= fiscalMonthIndex) {
        return new Date(currentYear + 1, fiscalMonthIndex, 1)
      } else {
        return new Date(currentYear, fiscalMonthIndex, 1)
      }
    }
    default:
      return null
  }
}

// ============================================
// Date-Only Parsing (Critical for avoiding timezone shifts)
// ============================================

/**
 * Parse a date-only ISO string without timezone conversion.
 * 
 * CRITICAL: Use this for date-only fields (dueDate, periodStart, periodEnd)
 * to avoid off-by-one day errors caused by UTC → local timezone conversion.
 * 
 * @example
 * // WRONG - causes off-by-one errors
 * format(new Date("2026-01-31T00:00:00.000Z"), "MMM d") // Shows "Jan 30" in EST
 * 
 * // CORRECT - parses date part only
 * format(parseDateOnly("2026-01-31T00:00:00.000Z"), "MMM d") // Shows "Jan 31"
 */
export function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Safely parse a date-only string, returning null if invalid.
 */
export function parseDateOnlySafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  try {
    const datePart = dateStr.split("T")[0]
    const [year, month, day] = datePart.split("-").map(Number)
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null
    return new Date(year, month - 1, day)
  } catch {
    return null
  }
}

// ============================================
// Formatting Functions
// ============================================

/**
 * Format a date as "MMM d, yyyy" in the specified timezone.
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "MMM d, yyyy")
}

/**
 * Format a date as "MMMM yyyy" in the specified timezone.
 */
export function formatMonthYearInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "MMMM yyyy")
}

/**
 * Format a date with a custom format string in the specified timezone.
 */
export function formatWithTimezone(date: Date, timezone: string, formatStr: string): string {
  return formatInTimeZone(date, timezone, formatStr)
}

/**
 * Get the month index (0-11) in the specified timezone.
 */
export function getMonthInTimezone(date: Date, timezone: string): number {
  const formatted = formatInTimeZone(date, timezone, "M")
  return parseInt(formatted, 10) - 1 // Convert 1-12 to 0-11
}

/**
 * Get the year in the specified timezone.
 */
export function getYearInTimezone(date: Date, timezone: string): number {
  const formatted = formatInTimeZone(date, timezone, "yyyy")
  return parseInt(formatted, 10)
}

/**
 * Get the day of month in the specified timezone.
 */
export function getDayInTimezone(date: Date, timezone: string): number {
  const formatted = formatInTimeZone(date, timezone, "d")
  return parseInt(formatted, 10)
}

// ============================================
// Board Name Generation
// ============================================

/**
 * Generate a board name based on cadence and period start.
 */
export function generatePeriodBoardName(
  cadence: BoardCadence,
  periodStart: Date,
  timezone: string,
  options?: { fiscalYearStartMonth?: number }
): string {
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY":
      return formatDateInTimezone(periodStart, timezone)
    case "WEEKLY":
      return `Week of ${formatDateInTimezone(periodStart, timezone)}`
    case "MONTHLY":
      return formatMonthYearInTimezone(periodStart, timezone)
    case "QUARTERLY": {
      const month = getMonthInTimezone(periodStart, timezone)
      const year = getYearInTimezone(periodStart, timezone)
      let quarterIndex = Math.floor(month / 3)
      let fiscalQuarter = quarterIndex + 1
      if (fiscalYearStartMonth !== 1) {
        const fiscalMonthIndex = fiscalYearStartMonth - 1
        const monthsFromFiscalStart = (month - fiscalMonthIndex + 12) % 12
        fiscalQuarter = Math.floor(monthsFromFiscalStart / 3) + 1
      }
      return `Q${fiscalQuarter} ${year}`
    }
    case "YEAR_END":
      return `Year-End ${getYearInTimezone(periodStart, timezone)}`
    case "AD_HOC":
      return ""
    default:
      return ""
  }
}

// ============================================
// Period Formatting
// ============================================

/**
 * Format a period for display based on cadence.
 */
export function formatPeriodDisplay(
  periodStart: Date | string | null,
  periodEnd: Date | string | null,
  cadence: BoardCadence | null,
  timezone: string
): string {
  if (!periodStart) return "—"
  
  const start = typeof periodStart === "string" ? new Date(periodStart) : periodStart
  
  switch (cadence) {
    case "MONTHLY":
      return formatMonthYearInTimezone(start, timezone)
    case "WEEKLY":
      return `Week of ${formatDateInTimezone(start, timezone)}`
    case "QUARTERLY": {
      const month = getMonthInTimezone(start, timezone)
      const year = getYearInTimezone(start, timezone)
      const q = Math.floor(month / 3) + 1
      return `Q${q} ${year}`
    }
    case "YEAR_END":
      return getYearInTimezone(start, timezone).toString()
    case "DAILY":
      return formatDateInTimezone(start, timezone)
    default:
      // For AD_HOC or unknown, show date range if end exists
      if (periodEnd) {
        const end = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd
        return `${formatDateInTimezone(start, timezone).split(",")[0]} - ${formatDateInTimezone(end, timezone)}`
      }
      return formatDateInTimezone(start, timezone)
  }
}
