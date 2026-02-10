/**
 * Accounting Data Preview
 *
 * POST /api/integrations/accounting/preview
 * Returns a sample of accounting data with filters applied.
 * Used to preview data before creating a database or when reconfiguring filters.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { sourceType, syncFilter = [], asOfDate } = body

    if (!sourceType || typeof sourceType !== "string") {
      return NextResponse.json(
        { error: "sourceType is required" },
        { status: 400 }
      )
    }

    // Validate syncFilter
    if (!Array.isArray(syncFilter)) {
      return NextResponse.json(
        { error: "syncFilter must be an array" },
        { status: 400 }
      )
    }

    // Default asOfDate to today
    const date = asOfDate || new Date().toISOString().split("T")[0]

    // Dynamic import to avoid loading the entire sync service on cold starts
    const { AccountingSyncService } = await import(
      "@/lib/services/accounting-sync.service"
    )

    const result = await AccountingSyncService.previewData(
      user.organizationId,
      sourceType,
      syncFilter,
      date,
      20
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error previewing accounting data:", error)
    const message =
      error instanceof Error ? error.message : "Failed to preview data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
