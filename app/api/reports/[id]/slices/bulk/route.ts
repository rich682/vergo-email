/**
 * Bulk Slice Creation API
 * 
 * POST /api/reports/[id]/slices/bulk - Create multiple slices from column values
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportSliceService } from "@/lib/services/report-slice.service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - Bulk create slices from column values
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reportId } = await params
    
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { columnKey, values, namePrefix } = body as {
      columnKey?: string
      values?: string[]
      namePrefix?: string
    }

    // Validate required fields
    if (!columnKey) {
      return NextResponse.json(
        { error: "columnKey is required" },
        { status: 400 }
      )
    }

    if (!values || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json(
        { error: "values array is required and must not be empty" },
        { status: 400 }
      )
    }

    // Bulk create slices
    const result = await ReportSliceService.createBulkSlices({
      organizationId: user.organizationId,
      reportDefinitionId: reportId,
      columnKey,
      values,
      createdById: user.id,
      namePrefix,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("Error bulk creating slices:", error)
    
    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to create slices" },
      { status: 400 }
    )
  }
}
