/**
 * BusinessDayService - Computes dates with business day awareness.
 * 
 * MVP: Weekends only (no holiday calendar support yet).
 * Used for period-aware scheduling of requests relative to accounting periods.
 */

import { addDays, subDays, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns"

export interface ScheduleConfig {
  mode: "ad_hoc" | "period_aware"
  // Only used when mode === "period_aware":
  anchor?: "period_start" | "period_end"  // default: "period_end"
  offsetDays?: number                      // business days (negative = before)
  weekendRule?: "previous" | "next"        // default: "previous"
  sendTime?: string                        // "HH:mm" 24h format, default: "09:00"
}

export interface ComputeScheduledDateParams {
  anchor: Date                             // periodStart or periodEnd
  offsetDays: number                       // business days (negative = before, positive = after)
  weekendRule: "previous" | "next"         // what to do if result lands on weekend
  sendTime: string                         // "HH:mm" 24h format
  timezone?: string                        // future: for timezone conversion (MVP: assumes local)
}

export class BusinessDayService {
  /**
   * Check if a date falls on a weekend (Saturday or Sunday).
   */
  static isWeekend(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6  // 0 = Sunday, 6 = Saturday
  }

  /**
   * Check if a date is a business day (not a weekend).
   * MVP: Only checks weekends. Future: could add holiday calendar support.
   */
  static isBusinessDay(date: Date): boolean {
    return !this.isWeekend(date)
  }

  /**
   * Get the next business day from a given date.
   * If the date is already a business day, returns the same date.
   */
  static getNextBusinessDay(date: Date): Date {
    let result = new Date(date)
    while (this.isWeekend(result)) {
      result = addDays(result, 1)
    }
    return result
  }

  /**
   * Get the previous business day from a given date.
   * If the date is already a business day, returns the same date.
   */
  static getPreviousBusinessDay(date: Date): Date {
    let result = new Date(date)
    while (this.isWeekend(result)) {
      result = subDays(result, 1)
    }
    return result
  }

  /**
   * Add (or subtract) business days from a date.
   * Positive days = move forward, negative days = move backward.
   * Skips weekends when counting.
   */
  static addBusinessDays(date: Date, days: number): Date {
    let result = new Date(date)
    const direction = days >= 0 ? 1 : -1
    let remaining = Math.abs(days)

    while (remaining > 0) {
      result = direction > 0 ? addDays(result, 1) : subDays(result, 1)
      if (this.isBusinessDay(result)) {
        remaining--
      }
    }

    return result
  }

  /**
   * Parse a time string "HH:mm" into hours and minutes.
   */
  static parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hoursStr, minutesStr] = timeStr.split(":")
    const hours = parseInt(hoursStr, 10) || 9
    const minutes = parseInt(minutesStr, 10) || 0
    return { hours, minutes }
  }

  /**
   * Set the time component of a date.
   */
  static setTime(date: Date, timeStr: string): Date {
    const { hours, minutes } = this.parseTime(timeStr)
    let result = setHours(date, hours)
    result = setMinutes(result, minutes)
    result = setSeconds(result, 0)
    result = setMilliseconds(result, 0)
    return result
  }

  /**
   * Compute the scheduled send datetime relative to an anchor date (e.g., period end).
   * 
   * Algorithm:
   * 1. Start from anchor date
   * 2. Add/subtract the specified number of business days
   * 3. If result lands on a weekend, apply the weekend rule
   * 4. Set the time component from sendTime
   * 5. Return the absolute datetime
   * 
   * @param params - Scheduling parameters
   * @returns Computed absolute datetime for sending
   */
  static computeScheduledDate(params: ComputeScheduledDateParams): Date {
    const {
      anchor,
      offsetDays,
      weekendRule,
      sendTime
    } = params

    // Step 1: Start from anchor
    let result = new Date(anchor)

    // Step 2: Add/subtract business days
    if (offsetDays !== 0) {
      result = this.addBusinessDays(result, offsetDays)
    }

    // Step 3: Apply weekend rule if needed
    if (this.isWeekend(result)) {
      result = weekendRule === "next"
        ? this.getNextBusinessDay(result)
        : this.getPreviousBusinessDay(result)
    }

    // Step 4: Set time component
    result = this.setTime(result, sendTime)

    return result
  }

  /**
   * Compute scheduled send date from a ScheduleConfig and board period dates.
   * Returns null if mode is "ad_hoc" or required dates are missing.
   * 
   * @param config - The schedule configuration
   * @param periodStart - Board's period start date
   * @param periodEnd - Board's period end date
   * @returns Computed datetime or null if ad-hoc/not computable
   */
  static computeFromConfig(
    config: ScheduleConfig | null | undefined,
    periodStart: Date | null | undefined,
    periodEnd: Date | null | undefined
  ): Date | null {
    // Ad-hoc or no config means no period-aware scheduling
    if (!config || config.mode !== "period_aware") {
      return null
    }

    // Determine anchor date
    const anchorType = config.anchor || "period_end"
    const anchor = anchorType === "period_start" ? periodStart : periodEnd

    // Cannot compute without anchor date
    if (!anchor) {
      console.warn(
        `[BusinessDayService] Cannot compute scheduled date: ${anchorType} is null`
      )
      return null
    }

    // Compute with defaults
    return this.computeScheduledDate({
      anchor,
      offsetDays: config.offsetDays ?? 0,
      weekendRule: config.weekendRule || "previous",
      sendTime: config.sendTime || "09:00"
    })
  }

  /**
   * Validate a schedule config object.
   * Returns validation errors or empty array if valid.
   */
  static validateConfig(config: unknown): string[] {
    const errors: string[] = []

    if (!config || typeof config !== "object") {
      errors.push("Schedule config must be an object")
      return errors
    }

    const c = config as Record<string, unknown>

    // Validate mode
    if (!c.mode || !["ad_hoc", "period_aware"].includes(c.mode as string)) {
      errors.push("mode must be 'ad_hoc' or 'period_aware'")
    }

    // For period_aware, validate other fields
    if (c.mode === "period_aware") {
      if (c.anchor && !["period_start", "period_end"].includes(c.anchor as string)) {
        errors.push("anchor must be 'period_start' or 'period_end'")
      }

      if (c.offsetDays !== undefined && typeof c.offsetDays !== "number") {
        errors.push("offsetDays must be a number")
      }

      if (c.weekendRule && !["previous", "next"].includes(c.weekendRule as string)) {
        errors.push("weekendRule must be 'previous' or 'next'")
      }

      if (c.sendTime) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        if (!timeRegex.test(c.sendTime as string)) {
          errors.push("sendTime must be in HH:mm format (24-hour)")
        }
      }
    }

    return errors
  }
}
