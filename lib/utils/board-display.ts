/**
 * Board display utilities.
 * Pure functions for computing board UI state (close speed, status indicators).
 */
import { differenceInDays, parseISO } from "date-fns"

export interface DaysUntilCloseResult {
  text: string
  className: string
  icon?: "zap" | null
}

/**
 * Compute the "days until close" display for a board row.
 * For closed boards with closedAt, shows close speed (e.g., "Closed in 12 days").
 * For open boards, shows countdown or overdue status.
 */
export function getDaysUntilClose(
  periodEnd: string | null,
  periodStart: string | null,
  isClosed: boolean,
  closedAt: string | null
): DaysUntilCloseResult | null {
  if (!periodEnd) return null

  if (isClosed) {
    // Show close speed for boards with closedAt
    if (closedAt && periodStart) {
      const closedDate = parseISO(closedAt)
      const endDate = parseISO(periodEnd)
      const startDate = parseISO(periodStart)
      const daysToClose = differenceInDays(closedDate, startDate)

      if (closedDate <= endDate) {
        return { text: `Closed in ${daysToClose} days`, className: "text-green-600", icon: "zap" }
      } else {
        const daysLate = differenceInDays(closedDate, endDate)
        return { text: `Closed ${daysLate} days late`, className: "text-amber-600", icon: null }
      }
    }
    return { text: "Closed", className: "text-green-600", icon: null }
  }

  const end = parseISO(periodEnd)
  const now = new Date()
  const days = differenceInDays(end, now)

  if (days < 0) {
    return { text: "Overdue", className: "text-red-600 font-medium", icon: null }
  }
  if (days === 0) {
    return { text: "Due today", className: "text-orange-600 font-medium", icon: null }
  }
  if (days === 1) {
    return { text: "1 day", className: "text-orange-600", icon: null }
  }
  return { text: `${days} days`, className: "text-gray-600", icon: null }
}
