/**
 * Report Slices API - List and Create
 * 
 * GET /api/reports/[id]/slices - List all slices for a report
 * POST /api/reports/[id]/slices - Create a new slice
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportSliceService, FilterBindings } from "@/lib/services/report-slice.service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - List slices for a report
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reportId } = await params
    
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

    // Verify report exists and belongs to organization
    const report = await prisma.reportDefinition.findFirst({
      where: {
        id: reportId,
        organizationId: user.organizationId,
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const slices = await ReportSliceService.listSlices(reportId, user.organizationId)

    return NextResponse.json({ slices })
  } catch (error) {
    console.error("Error listing slices:", error)
    return NextResponse.json(
      { error: "Failed to list slices" },
      { status: 500 }
    )
  }
}

// POST - Create a new slice
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
    const { name, filterBindings } = body as {
      name?: string
      filterBindings?: FilterBindings
    }

    // Validate required fields
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    // Create the slice
    const slice = await ReportSliceService.createSlice({
      organizationId: user.organizationId,
      reportDefinitionId: reportId,
      name: name.trim(),
      filterBindings: filterBindings || {},
      createdById: user.id,
    })

    return NextResponse.json({ slice }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating slice:", error)
    
    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    if (error.message === "A slice with this name already exists for this report") {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to create slice" },
      { status: 400 }
    )
  }
}
