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

    // Cannot parse ambiguous strings like "January" without year
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
