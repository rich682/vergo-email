/**
 * Period Utilities
 * 
 * Functions for handling period keys in reports with variance analysis.
 * Period keys are canonical string representations of time periods:
 * - daily: YYYY-MM-DD (e.g., "2026-01-28")
 * - monthly: YYYY-MM (e.g., "2026-01")
 * - quarterly: YYYY-QN (e.g., "2026-Q1")
 * - annual: YYYY (e.g., "2026")
 */

export type ReportCadence = "daily" | "monthly" | "quarterly" | "annual"

// ============================================
// Period Key Generation
// ============================================

/**
 * Generate a period key from a Date object based on cadence
 */
export function periodKeyFromDate(date: Date, cadence: ReportCadence): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 0-indexed
  const day = date.getDate()

  switch (cadence) {
    case "daily":
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    case "monthly":
      return `${year}-${String(month).padStart(2, "0")}`
    case "quarterly":
      const quarter = Math.ceil(month / 3)
      return `${year}-Q${quarter}`
    case "annual":
      return `${year}`
  }
}

/**
 * Parse a value (string, Date, number) into a period key
 * Returns null if the value cannot be parsed
 */
export function periodKeyFromValue(
  value: unknown,
  cadence: ReportCadence
): string | null {
  if (value === null || value === undefined) return null

  // Already a valid period key string
  if (typeof value === "string") {
    const trimmed = value.trim()
    
    // Check if it's already in period key format
    if (isValidPeriodKey(trimmed, cadence)) {
      return trimmed
    }

    // Try to parse as ISO date string
    const isoDate = parseISODate(trimmed)
    if (isoDate) {
      return periodKeyFromDate(isoDate, cadence)
    }

    // Try to parse YYYY-MM format for non-monthly cadences
    const yyyyMmMatch = trimmed.match(/^(\d{4})-(\d{2})$/)
    if (yyyyMmMatch) {
      const date = new Date(parseInt(yyyyMmMatch[1]), parseInt(yyyyMmMatch[2]) - 1, 1)
      return periodKeyFromDate(date, cadence)
    }

    // Try cadence-specific flexible parsing for user-friendly formats
    switch (cadence) {
      case "monthly": {
        const result = parseMonthlyPeriod(trimmed)
        if (result) return result
        break
      }
      case "quarterly": {
        const result = parseQuarterlyPeriod(trimmed)
        if (result) return result
        break
      }
      case "annual": {
        const result = parseAnnualPeriod(trimmed)
        if (result) return result
        break
      }
      case "daily": {
        const result = parseDailyPeriod(trimmed)
        if (result) return result
        break
      }
    }

    // Cannot parse - return null
    return null
  }

  // Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    return periodKeyFromDate(value, cadence)
  }

  // Number (assume Unix timestamp in milliseconds)
  if (typeof value === "number" && !isNaN(value)) {
    return periodKeyFromDate(new Date(value), cadence)
  }

  return null
}

/**
 * Parse an ISO date string (YYYY-MM-DD or full ISO)
 */
function parseISODate(value: string): Date | null {
  // Full ISO format: 2026-01-28T00:00:00.000Z
  if (value.includes("T")) {
    const date = new Date(value)
    if (!isNaN(date.getTime())) return date
  }

  // Date only: 2026-01-28
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (!isNaN(date.getTime())) return date
  }

  return null
}

// ============================================
// Period Key Validation
// ============================================

/**
 * Check if a string is a valid period key for the given cadence
 */
export function isValidPeriodKey(periodKey: string, cadence: ReportCadence): boolean {
  switch (cadence) {
    case "daily":
      // YYYY-MM-DD
      return /^\d{4}-\d{2}-\d{2}$/.test(periodKey) && isValidDate(periodKey)
    case "monthly":
      // YYYY-MM
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)
    case "quarterly":
      // YYYY-QN
      return /^\d{4}-Q[1-4]$/.test(periodKey)
    case "annual":
      // YYYY
      return /^\d{4}$/.test(periodKey)
  }
}

/**
 * Validate a YYYY-MM-DD date string represents a real date
 */
function isValidDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

// ============================================
// Period Resolution (MoM / YoY)
// ============================================

/**
 * Get the previous period key (for MoM comparison)
 */
export function previousPeriodKey(periodKey: string, cadence: ReportCadence): string {
  switch (cadence) {
    case "daily": {
      const [year, month, day] = periodKey.split("-").map(Number)
      const date = new Date(year, month - 1, day)
      date.setDate(date.getDate() - 1)
      return periodKeyFromDate(date, cadence)
    }
    case "monthly": {
      const [year, month] = periodKey.split("-").map(Number)
      if (month === 1) {
        return `${year - 1}-12`
      }
      return `${year}-${String(month - 1).padStart(2, "0")}`
    }
    case "quarterly": {
      const match = periodKey.match(/^(\d{4})-Q(\d)$/)
      if (!match) throw new Error(`Invalid quarterly period key: ${periodKey}`)
      const [, yearStr, quarterStr] = match
      const year = parseInt(yearStr)
      const quarter = parseInt(quarterStr)
      if (quarter === 1) {
        return `${year - 1}-Q4`
      }
      return `${year}-Q${quarter - 1}`
    }
    case "annual": {
      const year = parseInt(periodKey)
      return `${year - 1}`
    }
  }
}

/**
 * Get the same period from the previous year (for YoY comparison)
 */
export function samePeriodLastYearKey(periodKey: string): string {
  // For all cadences, just subtract 1 from the year
  if (periodKey.match(/^(\d{4})-Q\d$/)) {
    // Quarterly: 2026-Q1 -> 2025-Q1
    const year = parseInt(periodKey.substring(0, 4))
    return `${year - 1}${periodKey.substring(4)}`
  }
  if (periodKey.match(/^\d{4}$/)) {
    // Annual: 2026 -> 2025
    return `${parseInt(periodKey) - 1}`
  }
  if (periodKey.match(/^\d{4}-\d{2}$/)) {
    // Monthly: 2026-01 -> 2025-01
    const year = parseInt(periodKey.substring(0, 4))
    return `${year - 1}${periodKey.substring(4)}`
  }
  if (periodKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Daily: 2026-01-28 -> 2025-01-28
    const year = parseInt(periodKey.substring(0, 4))
    return `${year - 1}${periodKey.substring(4)}`
  }
  throw new Error(`Invalid period key format: ${periodKey}`)
}

// ============================================
// Period Labels
// ============================================

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

// ============================================
// Flexible Period Parsing (User-Friendly Formats)
// ============================================

/**
 * Map of month name variations to month number (1-12)
 */
const MONTH_NAME_MAP: Record<string, number> = {
  // Full names
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // Short names
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Parse monthly period from user-friendly formats
 * Supports: "Jan-26", "January 2026", "Jan 2026", "January-26"
 */
function parseMonthlyPeriod(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  
  // MMM-YY format: "Jan-26", "January-26"
  const dashYY = trimmed.match(/^([a-z]+)-(\d{2})$/i)
  if (dashYY) {
    const month = MONTH_NAME_MAP[dashYY[1].toLowerCase()]
    if (month) {
      const year = 2000 + parseInt(dashYY[2])
      return `${year}-${String(month).padStart(2, "0")}`
    }
  }
  
  // MMM-YYYY format: "Jan-2026", "January-2026"
  const dashYYYY = trimmed.match(/^([a-z]+)-(\d{4})$/i)
  if (dashYYYY) {
    const month = MONTH_NAME_MAP[dashYYYY[1].toLowerCase()]
    if (month) {
      const year = parseInt(dashYYYY[2])
      return `${year}-${String(month).padStart(2, "0")}`
    }
  }
  
  // MMMM YYYY format: "January 2026", "Jan 2026"
  const spaceYYYY = trimmed.match(/^([a-z]+)\s+(\d{4})$/i)
  if (spaceYYYY) {
    const month = MONTH_NAME_MAP[spaceYYYY[1].toLowerCase()]
    if (month) {
      const year = parseInt(spaceYYYY[2])
      return `${year}-${String(month).padStart(2, "0")}`
    }
  }
  
  // MMMM YY format: "January 26", "Jan 26" (but not single digit like "Jan 1")
  const spaceYY = trimmed.match(/^([a-z]+)\s+(\d{2})$/i)
  if (spaceYY) {
    const month = MONTH_NAME_MAP[spaceYY[1].toLowerCase()]
    if (month) {
      const year = 2000 + parseInt(spaceYY[2])
      return `${year}-${String(month).padStart(2, "0")}`
    }
  }
  
  return null
}

/**
 * Parse quarterly period from user-friendly formats
 * Supports: "Q1-26", "Q1 2026", "Q1-2026", "1Q26", "1Q 2026"
 */
function parseQuarterlyPeriod(value: string): string | null {
  const trimmed = value.trim()
  
  // QN-YY format: "Q1-26", "Q2-26"
  const qnDashYY = trimmed.match(/^Q([1-4])-(\d{2})$/i)
  if (qnDashYY) {
    const quarter = parseInt(qnDashYY[1])
    const year = 2000 + parseInt(qnDashYY[2])
    return `${year}-Q${quarter}`
  }
  
  // QN-YYYY format: "Q1-2026"
  const qnDashYYYY = trimmed.match(/^Q([1-4])-(\d{4})$/i)
  if (qnDashYYYY) {
    const quarter = parseInt(qnDashYYYY[1])
    const year = parseInt(qnDashYYYY[2])
    return `${year}-Q${quarter}`
  }
  
  // QN YYYY format: "Q1 2026"
  const qnSpaceYYYY = trimmed.match(/^Q([1-4])\s+(\d{4})$/i)
  if (qnSpaceYYYY) {
    const quarter = parseInt(qnSpaceYYYY[1])
    const year = parseInt(qnSpaceYYYY[2])
    return `${year}-Q${quarter}`
  }
  
  // QN YY format: "Q1 26"
  const qnSpaceYY = trimmed.match(/^Q([1-4])\s+(\d{2})$/i)
  if (qnSpaceYY) {
    const quarter = parseInt(qnSpaceYY[1])
    const year = 2000 + parseInt(qnSpaceYY[2])
    return `${year}-Q${quarter}`
  }
  
  // NQ YY format: "1Q26", "1Q 26"
  const nqYY = trimmed.match(/^([1-4])Q\s*(\d{2})$/i)
  if (nqYY) {
    const quarter = parseInt(nqYY[1])
    const year = 2000 + parseInt(nqYY[2])
    return `${year}-Q${quarter}`
  }
  
  // NQ YYYY format: "1Q2026", "1Q 2026"
  const nqYYYY = trimmed.match(/^([1-4])Q\s*(\d{4})$/i)
  if (nqYYYY) {
    const quarter = parseInt(nqYYYY[1])
    const year = parseInt(nqYYYY[2])
    return `${year}-Q${quarter}`
  }
  
  return null
}

/**
 * Parse annual period from user-friendly formats
 * Supports: "FY26", "FY2026", "FY 26", "FY 2026"
 */
function parseAnnualPeriod(value: string): string | null {
  const trimmed = value.trim()
  
  // FY YY format: "FY26", "FY 26"
  const fyYY = trimmed.match(/^FY\s*(\d{2})$/i)
  if (fyYY) {
    const year = 2000 + parseInt(fyYY[1])
    return `${year}`
  }
  
  // FY YYYY format: "FY2026", "FY 2026"
  const fyYYYY = trimmed.match(/^FY\s*(\d{4})$/i)
  if (fyYYYY) {
    const year = parseInt(fyYYYY[1])
    return `${year}`
  }
  
  // Just YY (2 digit year) - careful, only match if it looks like a year
  const justYY = trimmed.match(/^(\d{2})$/)
  if (justYY) {
    const num = parseInt(justYY[1])
    // Assume 00-99 maps to 2000-2099 for recent years
    if (num >= 0 && num <= 99) {
      return `${2000 + num}`
    }
  }
  
  return null
}

/**
 * Parse daily period from user-friendly formats
 * Supports: "1/15/26", "01/15/2026", "1-15-26", "01-15-2026", "Jan 15, 2026"
 */
function parseDailyPeriod(value: string): string | null {
  const trimmed = value.trim()
  
  // MM/DD/YY or M/D/YY format: "1/15/26", "01/15/26"
  const slashYY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (slashYY) {
    const month = parseInt(slashYY[1])
    const day = parseInt(slashYY[2])
    const year = 2000 + parseInt(slashYY[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  // MM/DD/YYYY format: "01/15/2026", "1/15/2026"
  const slashYYYY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashYYYY) {
    const month = parseInt(slashYYYY[1])
    const day = parseInt(slashYYYY[2])
    const year = parseInt(slashYYYY[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  // MM-DD-YY format: "01-15-26", "1-15-26"
  const dashYY = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/)
  if (dashYY) {
    const month = parseInt(dashYY[1])
    const day = parseInt(dashYY[2])
    const year = 2000 + parseInt(dashYY[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  // MM-DD-YYYY format: "01-15-2026"
  const dashYYYY = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashYYYY) {
    const month = parseInt(dashYYYY[1])
    const day = parseInt(dashYYYY[2])
    const year = parseInt(dashYYYY[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  // "Jan 15, 2026" or "January 15, 2026" format
  const monthDayYear = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})$/i)
  if (monthDayYear) {
    const month = MONTH_NAME_MAP[monthDayYear[1].toLowerCase()]
    const day = parseInt(monthDayYear[2])
    const year = parseInt(monthDayYear[3])
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  // "15 Jan 2026" or "15 January 2026" format
  const dayMonthYear = trimmed.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i)
  if (dayMonthYear) {
    const day = parseInt(dayMonthYear[1])
    const month = MONTH_NAME_MAP[dayMonthYear[2].toLowerCase()]
    const year = parseInt(dayMonthYear[3])
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  
  return null
}

/**
 * Generate a human-readable label for a period key
 */
export function labelForPeriodKey(periodKey: string, cadence: ReportCadence): string {
  switch (cadence) {
    case "daily": {
      // 2026-01-28 -> "Jan 28, 2026"
      const [year, month, day] = periodKey.split("-").map(Number)
      const monthName = MONTH_NAMES[month - 1].substring(0, 3)
      return `${monthName} ${day}, ${year}`
    }
    case "monthly": {
      // 2026-01 -> "January 2026"
      const [year, month] = periodKey.split("-").map(Number)
      return `${MONTH_NAMES[month - 1]} ${year}`
    }
    case "quarterly": {
      // 2026-Q1 -> "Q1 2026"
      const match = periodKey.match(/^(\d{4})-(Q\d)$/)
      if (!match) return periodKey
      return `${match[2]} ${match[1]}`
    }
    case "annual": {
      // 2026 -> "2026"
      return periodKey
    }
  }
}

// ============================================
// Period Enumeration (for UI pickers)
// ============================================

/**
 * Get a list of recent periods for selection
 * Returns periods in descending order (most recent first)
 */
export function getAvailablePeriods(
  cadence: ReportCadence,
  count: number = 24
): Array<{ key: string; label: string }> {
  const periods: Array<{ key: string; label: string }> = []
  const now = new Date()
  let currentKey = periodKeyFromDate(now, cadence)

  for (let i = 0; i < count; i++) {
    periods.push({
      key: currentKey,
      label: labelForPeriodKey(currentKey, cadence),
    })
    currentKey = previousPeriodKey(currentKey, cadence)
  }

  return periods
}

/**
 * Get available periods from database rows
 * Extracts unique period keys from the dateColumnKey values
 */
export function getPeriodsFromRows(
  rows: Array<Record<string, unknown>>,
  dateColumnKey: string,
  cadence: ReportCadence
): Array<{ key: string; label: string }> {
  const periodSet = new Set<string>()

  for (const row of rows) {
    const periodKey = periodKeyFromValue(row[dateColumnKey], cadence)
    if (periodKey) {
      periodSet.add(periodKey)
    }
  }

  // Sort descending (most recent first)
  const sortedKeys = Array.from(periodSet).sort().reverse()

  return sortedKeys.map(key => ({
    key,
    label: labelForPeriodKey(key, cadence),
  }))
}

// ============================================
// Compare Period Resolution
// ============================================

export type CompareMode = "none" | "mom" | "yoy"

/**
 * Resolve the compare period based on current period and compare mode
 */
export function resolveComparePeriod(
  currentPeriodKey: string,
  cadence: ReportCadence,
  compareMode: CompareMode
): string | null {
  if (compareMode === "none") return null
  
  if (compareMode === "mom") {
    return previousPeriodKey(currentPeriodKey, cadence)
  }
  
  if (compareMode === "yoy") {
    return samePeriodLastYearKey(currentPeriodKey)
  }
  
  return null
}
