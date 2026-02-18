import type { TriggerType } from "@/lib/workflows/types"

const TRIGGER_LABELS: Partial<Record<TriggerType, string>> = {
  board_created: "When a new period board is created",
  board_status_changed: "When a board status changes",
  scheduled: "On a schedule",
  data_condition: "When data meets a condition",
  data_uploaded: "When reconciliation data is uploaded",
  form_submitted: "When a form is submitted",
  compound: "On a schedule + when data is available",
  database_changed: "When linked data is updated",
}

const TRIGGER_SHORT_LABELS: Partial<Record<TriggerType, string>> = {
  board_created: "New period",
  board_status_changed: "Status change",
  scheduled: "Scheduled",
  data_condition: "Data condition",
  data_uploaded: "Data uploaded",
  form_submitted: "Form submitted",
  compound: "Schedule + Data",
  database_changed: "Database update",
}

/**
 * Get a human-readable description of a trigger configuration.
 */
export function getTriggerDescription(
  trigger: string,
  conditions?: Record<string, unknown> | null
): string {
  const base = TRIGGER_LABELS[trigger as TriggerType] || trigger

  if (!conditions) return base

  switch (trigger) {
    case "scheduled": {
      const cron = conditions.cronExpression as string | undefined
      if (cron) {
        const friendly = describeCron(cron)
        const tz = (conditions.timezone as string) || "UTC"
        return `${friendly} (${tz})`
      }
      return base
    }

    case "board_status_changed": {
      const status = conditions.targetStatus as string | undefined
      if (status) {
        const label = status === "COMPLETE" ? "completes" : `changes to ${status.toLowerCase().replace(/_/g, " ")}`
        return `When a board ${label}`
      }
      return base
    }

    case "data_condition": {
      const col = conditions.columnKey as string | undefined
      const op = conditions.operator as string | undefined
      if (col && op) {
        return `When "${col}" ${op} condition is met`
      }
      return base
    }

    case "form_submitted": {
      return "When a form response is submitted"
    }

    case "database_changed": {
      return "When linked database data is updated"
    }

    case "compound": {
      const cron = conditions.cronExpression as string | undefined
      const dbCond = conditions.databaseCondition as { columnKey?: string; operator?: string } | undefined
      const parts: string[] = []
      if (cron) {
        parts.push(describeCron(cron))
      }
      if (dbCond?.columnKey) {
        parts.push(`when "${dbCond.columnKey}" ${dbCond.operator || "meets"} condition`)
      }
      return parts.length > 0 ? parts.join(", then ") : base
    }

    default:
      return base
  }
}

/**
 * Get a short label for a trigger type (for badges/pills).
 */
export function getTriggerShortLabel(trigger: string): string {
  return TRIGGER_SHORT_LABELS[trigger as TriggerType] || trigger
}

/**
 * Simple cron expression to human-readable description.
 * Handles common patterns; falls back to raw cron for complex expressions.
 */
function describeCron(cron: string): string {
  const parts = cron.split(" ")
  if (parts.length !== 5) return `Runs on schedule (${cron})`

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  // Every minute / every hour
  if (minute === "*" && hour === "*") return "Runs every minute"
  if (minute !== "*" && hour === "*") return `Runs every hour at :${minute.padStart(2, "0")}`

  const timeStr = formatTime(parseInt(hour), parseInt(minute))

  // Daily
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Runs daily at ${timeStr}`
  }

  // Weekly
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const days = dayOfWeek.split(",").map((d) => DAY_NAMES[parseInt(d)] || d)
    return `Runs every ${days.join(", ")} at ${timeStr}`
  }

  // Monthly
  if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    const suffix = getOrdinalSuffix(parseInt(dayOfMonth))
    return `Runs on the ${dayOfMonth}${suffix} of every month at ${timeStr}`
  }

  return `Runs on schedule at ${timeStr}`
}

function formatTime(hour: number, minute: number): string {
  if (isNaN(hour) || isNaN(minute)) return "unknown time"
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

const DAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
}
