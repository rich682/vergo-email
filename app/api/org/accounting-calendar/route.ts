import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Common IANA timezones for validation
const VALID_TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
  "America/Toronto", "America/Vancouver", "America/Mexico_City",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam", "Europe/Zurich",
  "Europe/Dublin", "Europe/Madrid", "Europe/Rome", "Europe/Stockholm",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "Asia/Seoul",
  "Asia/Mumbai", "Asia/Dubai", "Asia/Bangkok", "Asia/Jakarta",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji",
  "Africa/Johannesburg", "Africa/Cairo", "Africa/Lagos",
  "America/Sao_Paulo", "America/Buenos_Aires", "America/Santiago",
]

/**
 * Validate if a string is a valid IANA timezone
 */
function isValidTimezone(tz: string): boolean {
  if (VALID_TIMEZONES.includes(tz)) return true
  // Also try to validate using Intl API
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * GET /api/org/accounting-calendar - Get accounting calendar settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { fiscalYearStartMonth: true, timezone: true }
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    return NextResponse.json({
      fiscalYearStartMonth: org.fiscalYearStartMonth,
      timezone: org.timezone
    })
  } catch (error: any) {
    console.error("[API/org/accounting-calendar] Error getting settings:", error)
    return NextResponse.json(
      { error: "Failed to get accounting calendar settings" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/org/accounting-calendar - Update accounting calendar settings
 * 
 * Body:
 * - fiscalYearStartMonth: number (1-12)
 * - timezone?: string (IANA timezone e.g. "America/New_York", "Australia/Sydney")
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can update accounting calendar settings" }, { status: 403 })
    }

    const body = await request.json()
    const { fiscalYearStartMonth, timezone } = body

    // Validate fiscalYearStartMonth
    if (typeof fiscalYearStartMonth !== "number" || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      return NextResponse.json(
        { error: "Fiscal year start month must be a number between 1 and 12" },
        { status: 400 }
      )
    }

    // Validate timezone if provided
    if (timezone !== undefined) {
      if (typeof timezone !== "string" || !isValidTimezone(timezone)) {
        return NextResponse.json(
          { error: "Invalid timezone. Please provide a valid IANA timezone (e.g., 'America/New_York', 'Australia/Sydney')" },
          { status: 400 }
        )
      }
    }

    const updateData: { fiscalYearStartMonth: number; timezone?: string } = { fiscalYearStartMonth }
    if (timezone !== undefined) {
      updateData.timezone = timezone
    }

    const org = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: updateData,
      select: { fiscalYearStartMonth: true, timezone: true }
    })

    return NextResponse.json({
      fiscalYearStartMonth: org.fiscalYearStartMonth,
      timezone: org.timezone
    })
  } catch (error: any) {
    console.error("[API/org/accounting-calendar] Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update accounting calendar settings" },
      { status: 500 }
    )
  }
}
