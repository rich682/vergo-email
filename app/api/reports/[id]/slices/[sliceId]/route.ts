/**
 * Report Slices API - Single Slice Operations
 * 
 * GET /api/reports/[id]/slices/[sliceId] - Get a single slice
 * PATCH /api/reports/[id]/slices/[sliceId] - Update a slice
 * DELETE /api/reports/[id]/slices/[sliceId] - Delete a slice
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportSliceService, FilterBindings } from "@/lib/services/report-slice.service"

interface RouteParams {
  params: Promise<{ id: string; sliceId: string }>
}

// GET - Get a single slice
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reportId, sliceId } = await params
    
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

    const slice = await ReportSliceService.getSlice(sliceId, user.organizationId)

    if (!slice) {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }

    // Verify slice belongs to the specified report
    if (slice.reportDefinitionId !== reportId) {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }

    return NextResponse.json({ slice })
  } catch (error) {
    console.error("Error getting slice:", error)
    return NextResponse.json(
      { error: "Failed to get slice" },
      { status: 500 }
    )
  }
}

// PATCH - Update a slice
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reportId, sliceId } = await params
    
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

    // Verify slice belongs to the specified report
    const existing = await ReportSliceService.getSlice(sliceId, user.organizationId)
    if (!existing || existing.reportDefinitionId !== reportId) {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, filterBindings } = body as {
      name?: string
      filterBindings?: FilterBindings
    }

    // Validate name if provided
    if (name !== undefined && !name?.trim()) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      )
    }

    const slice = await ReportSliceService.updateSlice(
      sliceId,
      user.organizationId,
      {
        name: name?.trim(),
        filterBindings,
      }
    )

    return NextResponse.json({ slice })
  } catch (error: any) {
    console.error("Error updating slice:", error)
    
    if (error.message === "Slice not found") {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }
    
    if (error.message === "A slice with this name already exists for this report") {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to update slice" },
      { status: 400 }
    )
  }
}

// DELETE - Delete a slice
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reportId, sliceId } = await params
    
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

    // Verify slice belongs to the specified report
    const existing = await ReportSliceService.getSlice(sliceId, user.organizationId)
    if (!existing || existing.reportDefinitionId !== reportId) {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }

    await ReportSliceService.deleteSlice(sliceId, user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting slice:", error)
    
    if (error.message === "Slice not found") {
      return NextResponse.json({ error: "Slice not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to delete slice" },
      { status: 400 }
    )
  }
}
