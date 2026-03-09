/**
 * Target Date Rules — accounting-friendly date patterns for recurring tasks
 *
 * Instead of picking a specific calendar date, users define a pattern like
 * "28th of the month" or "every other Friday". The system computes a concrete
 * dueDate from the pattern + the board's period context.
 */

import {
  lastDayOfMonth,
  setDate,
  getDay,
  addDays,
  differenceInCalendarDays,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  nextDay,
} from "date-fns"
import { parseDateOnlySafe } from "@/lib/utils/timezone"

// ── Rule Types ──────────────────────────────────────────────────────

export interface DayOfMonthRule {
  type: "day_of_month"
  day: number // 1-31
}

export interface LastDayOfMonthRule {
  type: "last_day_of_month"
}

export interface DayOfWeekRule {
  type: "day_of_week"
  dayOfWeek: number // 0=Sun, 1=Mon ... 6=Sat
}

export interface BiweeklyRule {
  type: "biweekly"
  dayOfWeek: number // 0-6
  anchorDate: string // YYYY-MM-DD of a known occurrence
}

export type TargetDateRule =
  | DayOfMonthRule
  | LastDayOfMonthRule
  | DayOfWeekRule
  | BiweeklyRule

// ── Helpers (inlined from cron-helpers.ts patterns) ─────────────────

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const DAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
}

const DAY_NAMES_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
}

// ── Validation ──────────────────────────────────────────────────────

export function isValidTargetDateRule(rule: unknown): rule is TargetDateRule {
  if (!rule || typeof rule !== "object") return false
  const r = rule as any

  switch (r.type) {
    case "day_of_month":
      return typeof r.day === "number" && r.day >= 1 && r.day <= 31
    case "last_day_of_month":
      return true
    case "day_of_week":
      return typeof r.dayOfWeek === "number" && r.dayOfWeek >= 0 && r.dayOfWeek <= 6
    case "biweekly":
      return (
        typeof r.dayOfWeek === "number" &&
        r.dayOfWeek >= 0 &&
        r.dayOfWeek <= 6 &&
        typeof r.anchorDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.anchorDate)
      )
    default:
      return false
  }
}

// ── Compute Due Date ────────────────────────────────────────────────

/**
 * Computes a concrete due date from a target date rule and a board period.
 * Falls back to the current month if no period is provided.
 */
export function computeDueDateFromRule(
  rule: TargetDateRule,
  periodStart?: string | Date | null,
  periodEnd?: string | Date | null
): Date {
  // Determine reference month from the period (or current month as fallback)
  const refStart = periodStart
    ? periodStart instanceof Date
      ? periodStart
      : parseDateOnlySafe(periodStart) || new Date()
    : new Date()

  const refEnd = periodEnd
    ? periodEnd instanceof Date
      ? periodEnd
      : parseDateOnlySafe(periodEnd) || null
    : null

  switch (rule.type) {
    case "day_of_month": {
      const daysInMonth = getDaysInMonth(refStart)
      const clampedDay = Math.min(rule.day, daysInMonth)
      return setDate(startOfMonth(refStart), clampedDay)
    }

    case "last_day_of_month": {
      return lastDayOfMonth(refStart)
    }

    case "day_of_week": {
      // Find first occurrence of dayOfWeek within the period
      return findDayOfWeekInPeriod(rule.dayOfWeek, refStart, refEnd)
    }

    case "biweekly": {
      return findBiweeklyInPeriod(rule.dayOfWeek, rule.anchorDate, refStart, refEnd)
    }
  }
}

/** Find the first occurrence of a weekday within a period */
function findDayOfWeekInPeriod(
  dayOfWeek: number,
  periodStart: Date,
  periodEnd: Date | null
): Date {
  const end = periodEnd || endOfMonth(periodStart)
  let current = new Date(periodStart)

  // If periodStart is already the right day, return it
  if (getDay(current) === dayOfWeek) return current

  // Find the next occurrence
  current = nextDay(current, dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6)

  // If it falls outside the period, use last occurrence before period end
  if (current > end) {
    // Walk backward from end
    let candidate = new Date(end)
    while (getDay(candidate) !== dayOfWeek) {
      candidate = addDays(candidate, -1)
    }
    return candidate
  }

  return current
}

/** Find the biweekly occurrence within a period, stepping from anchor */
function findBiweeklyInPeriod(
  dayOfWeek: number,
  anchorDateStr: string,
  periodStart: Date,
  periodEnd: Date | null
): Date {
  const anchor = parseDateOnlySafe(anchorDateStr) || new Date()
  const end = periodEnd || endOfMonth(periodStart)

  // Step from anchor in 14-day increments to find occurrences near/within the period
  const daysDiff = differenceInCalendarDays(periodStart, anchor)
  // Number of full 2-week cycles to skip
  const cyclesToSkip = Math.floor(daysDiff / 14)
  let candidate = addDays(anchor, cyclesToSkip * 14)

  // Ensure candidate is on or after periodStart (check a few around)
  const candidates: Date[] = []
  for (let offset = -1; offset <= 2; offset++) {
    const d = addDays(candidate, offset * 14)
    if (d >= periodStart && d <= end) {
      candidates.push(d)
    }
  }

  if (candidates.length > 0) {
    return candidates[0]
  }

  // Fallback: just find the right weekday in the period
  return findDayOfWeekInPeriod(dayOfWeek, periodStart, end)
}

// ── Human-Readable Description ──────────────────────────────────────

export function describeTargetDateRule(rule: TargetDateRule): string {
  switch (rule.type) {
    case "day_of_month":
      return `${rule.day}${getOrdinalSuffix(rule.day)} of the month`
    case "last_day_of_month":
      return "Last day of the month"
    case "day_of_week":
      return `Every ${DAY_NAMES[rule.dayOfWeek] || "day"}`
    case "biweekly":
      return `Every other ${DAY_NAMES[rule.dayOfWeek] || "day"}`
  }
}

/** Short description for compact displays */
export function describeTargetDateRuleShort(rule: TargetDateRule): string {
  switch (rule.type) {
    case "day_of_month":
      return `${rule.day}${getOrdinalSuffix(rule.day)}`
    case "last_day_of_month":
      return "Last day"
    case "day_of_week":
      return `Every ${DAY_NAMES_SHORT[rule.dayOfWeek] || "day"}`
    case "biweekly":
      return `Biweekly ${DAY_NAMES_SHORT[rule.dayOfWeek] || "day"}`
  }
}

// ── Parse Free-Text (for bulk import) ───────────────────────────────

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

/**
 * Parses accounting-friendly text like "28th of each month" or "every other Friday"
 * into a TargetDateRule. Returns null if the text can't be parsed.
 */
export function parseTargetDateText(text: string): TargetDateRule | null {
  if (!text) return null
  const t = text.toLowerCase().trim()

  // "last day of the month" / "month end" / "EOM" / "end of month"
  if (
    /last\s+day/i.test(t) ||
    /month\s*end/i.test(t) ||
    /end\s+of\s+(the\s+)?month/i.test(t) ||
    t === "eom"
  ) {
    return { type: "last_day_of_month" }
  }

  // "every other Friday" / "biweekly Friday" / "every 2 weeks on Friday"
  const biweeklyMatch = t.match(
    /(?:every\s+other|biweekly|every\s+2\s+weeks?\s+(?:on\s+)?)(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)/i
  )
  if (biweeklyMatch) {
    const dayOfWeek = DAY_NAME_TO_NUM[biweeklyMatch[1].toLowerCase()]
    if (dayOfWeek !== undefined) {
      // Anchor to the next occurrence of this day from today
      const today = new Date()
      let anchor = today
      while (getDay(anchor) !== dayOfWeek) {
        anchor = addDays(anchor, 1)
      }
      const anchorDate = anchor.toISOString().split("T")[0]
      return { type: "biweekly", dayOfWeek, anchorDate }
    }
  }

  // "every Friday" / "weekly on Friday" / "Fridays"
  const weeklyMatch = t.match(
    /(?:every|weekly\s+(?:on\s+)?)(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)/i
  )
  if (weeklyMatch) {
    const dayOfWeek = DAY_NAME_TO_NUM[weeklyMatch[1].toLowerCase()]
    if (dayOfWeek !== undefined) {
      return { type: "day_of_week", dayOfWeek }
    }
  }

  // Plural day name alone: "Fridays", "Mondays"
  const pluralDayMatch = t.match(
    /^(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?)$/i
  )
  if (pluralDayMatch) {
    const base = pluralDayMatch[1].toLowerCase().replace(/s$/, "")
    const dayOfWeek = DAY_NAME_TO_NUM[base]
    if (dayOfWeek !== undefined) {
      return { type: "day_of_week", dayOfWeek }
    }
  }

  // "28th of each month" / "28th" / "the 28th" / "28th of the month"
  const dayOfMonthMatch = t.match(/(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(?:each|every|the)?\s*(?:month)?)?/)
  if (dayOfMonthMatch) {
    const day = parseInt(dayOfMonthMatch[1], 10)
    if (day >= 1 && day <= 31) {
      return { type: "day_of_month", day }
    }
  }

  return null
}

// ── Constants for UI ────────────────────────────────────────────────

export const FREQUENCY_OPTIONS = [
  { value: "monthly" as const, label: "Monthly" },
  { value: "weekly" as const, label: "Weekly" },
  { value: "biweekly" as const, label: "Every other week" },
]

export type FrequencyType = "monthly" | "weekly" | "biweekly"

export function getFrequencyFromRule(rule: TargetDateRule): FrequencyType {
  switch (rule.type) {
    case "day_of_month":
    case "last_day_of_month":
      return "monthly"
    case "day_of_week":
      return "weekly"
    case "biweekly":
      return "biweekly"
  }
}

export { DAY_NAMES, DAY_NAMES_SHORT, getOrdinalSuffix }
