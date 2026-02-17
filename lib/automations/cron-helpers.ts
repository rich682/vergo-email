import type { CronSchedule } from "./types"

/**
 * Convert a friendly CronSchedule to a cron expression string.
 */
export function scheduleToCron(schedule: CronSchedule): string {
  const minute = schedule.minute
  const hour = schedule.hour

  switch (schedule.frequency) {
    case "daily":
      return `${minute} ${hour} * * *`

    case "weekly": {
      const days = schedule.dayOfWeek?.length ? schedule.dayOfWeek.join(",") : "1" // Default Monday
      return `${minute} ${hour} * * ${days}`
    }

    case "monthly": {
      const day = schedule.dayOfMonth || 1
      // -1 means "last day" — cron doesn't support this directly,
      // but we use 28 as a safe proxy. The backend handles month-end logic.
      const dayStr = day === -1 ? "28" : String(day)
      return `${minute} ${hour} ${dayStr} * *`
    }

    default:
      return `${minute} ${hour} * * *`
  }
}

/**
 * Parse a cron expression into a friendly CronSchedule.
 * Returns null if the expression can't be parsed into a simple schedule.
 */
export function cronToSchedule(cron: string, timezone: string = "UTC"): CronSchedule | null {
  const parts = cron.split(" ")
  if (parts.length !== 5) return null

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts

  // Only handle simple numeric minute and hour
  const minute = parseInt(minuteStr)
  const hour = parseInt(hourStr)
  if (isNaN(minute) || isNaN(hour)) return null

  // Must be every month
  if (monthStr !== "*") return null

  // Daily: * * * * (dom=*, dow=*)
  if (dayOfMonthStr === "*" && dayOfWeekStr === "*") {
    return { frequency: "daily", hour, minute, timezone }
  }

  // Weekly: * * dow (dom=*)
  if (dayOfMonthStr === "*" && dayOfWeekStr !== "*") {
    const dayOfWeek = dayOfWeekStr.split(",").map(Number).filter((n) => !isNaN(n))
    if (dayOfWeek.length === 0) return null
    return { frequency: "weekly", dayOfWeek, hour, minute, timezone }
  }

  // Monthly: dom * * (dow=*)
  if (dayOfMonthStr !== "*" && dayOfWeekStr === "*") {
    const dayOfMonth = parseInt(dayOfMonthStr)
    if (isNaN(dayOfMonth)) return null
    return { frequency: "monthly", dayOfMonth, hour, minute, timezone }
  }

  return null
}

/**
 * Format a schedule into a human-readable preview string.
 */
export function describeSchedule(schedule: CronSchedule): string {
  const timeStr = formatTime12(schedule.hour, schedule.minute)

  switch (schedule.frequency) {
    case "daily":
      return `Every day at ${timeStr}`

    case "weekly": {
      const days = (schedule.dayOfWeek || [1]).map((d) => DAY_NAMES_SHORT[d] || `Day ${d}`)
      return `Every ${days.join(", ")} at ${timeStr}`
    }

    case "monthly": {
      const day = schedule.dayOfMonth || 1
      if (day === -1) return `Last day of every month at ${timeStr}`
      const suffix = getOrdinalSuffix(day)
      return `${day}${suffix} of every month at ${timeStr}`
    }

    default:
      return `At ${timeStr}`
  }
}

function formatTime12(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM"
  const h = hour % 12 || 12
  const m = minute.toString().padStart(2, "0")
  return `${h}:${m} ${ampm}`
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
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

/** Common timezone options for the timezone selector */
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Asia/Dubai", label: "Gulf Standard (GST)" },
  { value: "Asia/Kolkata", label: "India Standard (IST)" },
  { value: "Asia/Shanghai", label: "China Standard (CST)" },
  { value: "Asia/Tokyo", label: "Japan Standard (JST)" },
  { value: "Australia/Sydney", label: "Australian Eastern (AEST)" },
]
