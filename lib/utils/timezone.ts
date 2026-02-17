/**
 * Timezone Utilities
 * 
 * Centralized timezone-aware date operations for the application.
 * 
 * ============================================================================
 * CRITICAL: DATE-ONLY FIELDS (periodStart, periodEnd, dueDate)
 * ============================================================================
 * 
 * Date-only fields are stored as UTC midnight (e.g., "2026-01-01T00:00:00.000Z").
 * 
 * NEVER use these patterns with date-only fields:
 *   ❌ new Date(periodStart)           - causes timezone shift
 *   ❌ toZonedTime(periodStart, tz)    - causes timezone shift
 *   ❌ formatInTimeZone(date, tz, fmt) - causes timezone shift
 * 
 * ALWAYS use these patterns instead:
 *   ✅ parseDateOnly(periodStart)      - extracts date without TZ shift
 *   ✅ formatDateOnly(periodStart)     - formats without TZ shift
 *   ✅ formatPeriodDisplay(...)        - already uses parseDateOnly internally
 * 
 * Why? UTC midnight in a US timezone becomes the previous day:
 *   new Date("2026-01-01T00:00:00.000Z") in PST = Dec 31, 2025 4:00 PM
 * 
 * ============================================================================
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
  subDays,
  subWeeks,
  subMonths,
  isWeekend,
  nextMonday,
  previousFriday,
  format,
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
 * 
 * IMPORTANT: Period dates are date-only fields stored as UTC midnight.
 * We use parseDateOnly to get the calendar date without timezone shift.
 */
export function getEndOfPeriod(
  cadence: BoardCadence,
  periodStart: Date,
  _timezone: string, // Kept for API compatibility - dates are now parsed without TZ shift
  options?: { fiscalYearStartMonth?: number }
): Date | null {
  if (!periodStart) return null

  // Parse as date-only to avoid timezone shift
  const dateStr = periodStart.toISOString()
  const start = parseDateOnly(dateStr)
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY":
      return endOfDay(start)
    case "WEEKLY":
      return endOfWeek(start, { weekStartsOn: 1 })
    case "MONTHLY":
      return endOfMonth(start)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        return endOfQuarter(start)
      }
      // Fiscal quarter end: 3 months after start, minus 1 day
      const quarterEnd = addMonths(start, 3)
      return addDays(quarterEnd, -1)
    }
    case "YEAR_END": {
      if (fiscalYearStartMonth === 1) {
        return endOfYear(start)
      }
      // Fiscal year end: 12 months after start, minus 1 day
      const yearEnd = addMonths(start, 12)
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
 * 
 * IMPORTANT: Period dates are date-only fields stored as UTC midnight.
 * We use parseDateOnly to get the calendar date without timezone shift.
 * This prevents Jan 1 UTC from being interpreted as Dec 31 in US timezones.
 */
export function calculateNextPeriodStart(
  cadence: BoardCadence | null | undefined,
  currentPeriodStart: Date | null | undefined,
  _timezone: string, // Kept for API compatibility - dates are now parsed without TZ shift
  options?: { skipWeekends?: boolean; fiscalYearStartMonth?: number }
): Date | null {
  if (!cadence || !currentPeriodStart || cadence === "AD_HOC") return null

  // Parse as date-only to avoid timezone shift (e.g., Jan 1 UTC becoming Dec 31 in US timezones)
  const dateStr = currentPeriodStart.toISOString()
  const current = parseDateOnly(dateStr)
  
  const skipWeekends = options?.skipWeekends ?? true
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY": {
      let nextDate = addDays(current, 1)
      if (skipWeekends && isWeekend(nextDate)) {
        nextDate = nextMonday(nextDate)
      }
      return nextDate
    }
    case "WEEKLY":
      return addWeeks(startOfWeek(current, { weekStartsOn: 1 }), 1)
    case "MONTHLY":
      return addMonths(startOfMonth(current), 1)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        const quarterMonth = Math.floor(current.getMonth() / 3) * 3
        const currentQuarterStart = new Date(current.getFullYear(), quarterMonth, 1)
        return addMonths(currentQuarterStart, 3)
      }
      // Fiscal quarters
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const monthsFromFiscalStart = (current.getMonth() - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      const quarterStartMonthOffset = fiscalQuarter * 3
      const currentFiscalQuarterStartMonth = (fiscalMonthIndex + quarterStartMonthOffset) % 12
      let year = current.getFullYear()
      if (currentFiscalQuarterStartMonth > current.getMonth() && current.getMonth() < fiscalMonthIndex) {
        year--
      }
      const currentFiscalQuarterStart = new Date(year, currentFiscalQuarterStartMonth, 1)
      return addMonths(currentFiscalQuarterStart, 3)
    }
    case "YEAR_END": {
      const currentYear = current.getFullYear()
      if (fiscalYearStartMonth === 1) {
        return new Date(currentYear + 1, 0, 1)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      if (current.getMonth() >= fiscalMonthIndex) {
        return new Date(currentYear + 1, fiscalMonthIndex, 1)
      } else {
        return new Date(currentYear, fiscalMonthIndex, 1)
      }
    }
    default:
      return null
  }
}

/**
 * Calculate the previous period start date based on cadence.
 * Used when creating boards for past periods.
 */
export function calculatePreviousPeriodStart(
  cadence: BoardCadence | null | undefined,
  currentPeriodStart: Date | null | undefined,
  _timezone: string,
  options?: { skipWeekends?: boolean; fiscalYearStartMonth?: number }
): Date | null {
  if (!cadence || !currentPeriodStart || cadence === "AD_HOC") return null

  const dateStr = currentPeriodStart.toISOString()
  const current = parseDateOnly(dateStr)

  const skipWeekends = options?.skipWeekends ?? true
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY": {
      let prevDate = subDays(current, 1)
      if (skipWeekends && isWeekend(prevDate)) {
        prevDate = previousFriday(prevDate)
      }
      return prevDate
    }
    case "WEEKLY":
      return subWeeks(startOfWeek(current, { weekStartsOn: 1 }), 1)
    case "MONTHLY":
      return subMonths(startOfMonth(current), 1)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        const quarterMonth = Math.floor(current.getMonth() / 3) * 3
        const currentQuarterStart = new Date(current.getFullYear(), quarterMonth, 1)
        return subMonths(currentQuarterStart, 3)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const monthsFromFiscalStart = (current.getMonth() - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      const quarterStartMonthOffset = fiscalQuarter * 3
      const currentFiscalQuarterStartMonth = (fiscalMonthIndex + quarterStartMonthOffset) % 12
      let year = current.getFullYear()
      if (currentFiscalQuarterStartMonth > current.getMonth() && current.getMonth() < fiscalMonthIndex) {
        year--
      }
      const currentFiscalQuarterStart = new Date(year, currentFiscalQuarterStartMonth, 1)
      return subMonths(currentFiscalQuarterStart, 3)
    }
    case "YEAR_END": {
      const currentYear = current.getFullYear()
      if (fiscalYearStartMonth === 1) {
        return new Date(currentYear - 1, 0, 1)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      if (current.getMonth() >= fiscalMonthIndex) {
        return new Date(currentYear - 1, fiscalMonthIndex, 1)
      } else {
        return new Date(currentYear - 2, fiscalMonthIndex, 1)
      }
    }
    default:
      return null
  }
}

// ============================================
// DATE-ONLY FIELD HANDLING
// ============================================
// 
// Use these functions for: periodStart, periodEnd, dueDate
// These fields are stored as UTC midnight and should NEVER be timezone-converted.
//
// ============================================

/**
 * Parse a date-only ISO string without timezone conversion.
 * 
 * USE THIS for date-only fields (dueDate, periodStart, periodEnd)
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

/**
 * Format a date-only field (periodStart, periodEnd, dueDate) for display.
 * 
 * USE THIS instead of format(new Date(dateStr), ...) to avoid timezone shift.
 * 
 * @param dateStr - ISO date string like "2026-01-31T00:00:00.000Z"
 * @param formatStr - date-fns format string (default: "MMM d, yyyy")
 * @returns Formatted date string, or "—" if null
 * 
 * @example
 * formatDateOnly("2026-01-31T00:00:00.000Z") // "Jan 31, 2026"
 * formatDateOnly("2026-01-31T00:00:00.000Z", "MMMM yyyy") // "January 2026"
 */
export function formatDateOnly(
  dateStr: string | null | undefined,
  formatStr: string = "MMM d, yyyy"
): string {
  if (!dateStr) return "—"
  const date = parseDateOnly(dateStr)
  return format(date, formatStr)
}

/**
 * Format a date range from two date-only fields.
 * 
 * @example
 * formatDateOnlyRange("2026-01-01T00:00:00Z", "2026-01-31T00:00:00Z")
 * // "Jan 1, 2026 - Jan 31, 2026"
 */
export function formatDateOnlyRange(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
  formatStr: string = "MMM d, yyyy"
): string {
  if (!startStr) return "—"
  if (!endStr) return formatDateOnly(startStr, formatStr)
  return `${formatDateOnly(startStr, formatStr)} - ${formatDateOnly(endStr, formatStr)}`
}

// ============================================
// TIMEZONE-AWARE FORMATTING (for timestamps, NOT date-only fields)
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
 *
 * IMPORTANT: periodStart is a date-only field stored as UTC midnight.
 * Uses parseDateOnly to avoid timezone shift (e.g., Feb 13 UTC becoming Feb 12 in US timezones).
 */
export function generatePeriodBoardName(
  cadence: BoardCadence,
  periodStart: Date,
  _timezone: string,
  options?: { fiscalYearStartMonth?: number }
): string {
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  // Parse as date-only to avoid timezone shift on UTC midnight dates
  const date = parseDateOnly(periodStart.toISOString())

  switch (cadence) {
    case "DAILY":
      return format(date, "MMM d, yyyy")
    case "WEEKLY":
      return `Week of ${format(date, "MMM d, yyyy")}`
    case "MONTHLY":
      return format(date, "MMMM yyyy")
    case "QUARTERLY": {
      const month = date.getMonth()
      const year = date.getFullYear()
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
      return `Year-End ${date.getFullYear()}`
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
 * 
 * IMPORTANT: Uses parseDateOnly to avoid timezone shift issues.
 * Period dates are date-only fields (stored as UTC midnight) and should
 * be displayed as the calendar date, not shifted by timezone.
 */
export function formatPeriodDisplay(
  periodStart: Date | string | null,
  periodEnd: Date | string | null,
  cadence: BoardCadence | null,
  _timezone: string // Kept for API compatibility but not used - dates are parsed without TZ shift
): string {
  if (!periodStart) return "—"
  
  // Use parseDateOnly to avoid timezone shift (e.g., Jan 1 UTC showing as Dec 31 in US timezones)
  const start = typeof periodStart === "string" ? parseDateOnly(periodStart) : periodStart
  
  switch (cadence) {
    case "MONTHLY":
      return format(start, "MMMM yyyy")
    case "WEEKLY":
      return `Week of ${format(start, "MMM d, yyyy")}`
    case "QUARTERLY": {
      const month = start.getMonth()
      const year = start.getFullYear()
      const q = Math.floor(month / 3) + 1
      return `Q${q} ${year}`
    }
    case "YEAR_END":
      return start.getFullYear().toString()
    case "DAILY":
      return format(start, "MMM d, yyyy")
    default:
      // For AD_HOC or unknown, show date range if end exists
      if (periodEnd) {
        const end = typeof periodEnd === "string" ? parseDateOnly(periodEnd) : periodEnd
        return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
      }
      return format(start, "MMM d, yyyy")
  }
}
