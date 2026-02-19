import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService, derivePeriodEnd, normalizePeriodStart } from "@/lib/services/board.service"
import { BoardStatus, BoardCadence } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/boards - List all boards for the organization
 * 
 * Query params:
 * - status: BoardStatus or comma-separated list
 * - cadence: BoardCadence or comma-separated list
 * - ownerId: Filter by owner
 * - year: Filter by periodStart year
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(request.url)
    
    // Parse status filter
    const statusParam = searchParams.get("status")
    let status: BoardStatus | BoardStatus[] | undefined
    if (statusParam) {
      if (statusParam.includes(",")) {
        status = statusParam.split(",") as BoardStatus[]
      } else {
        status = statusParam as BoardStatus
      }
    }

    // Parse cadence filter
    const cadenceParam = searchParams.get("cadence")
    let cadence: BoardCadence | BoardCadence[] | undefined
    if (cadenceParam) {
      if (cadenceParam.includes(",")) {
        cadence = cadenceParam.split(",") as BoardCadence[]
      } else {
        cadence = cadenceParam as BoardCadence
      }
    }

    // Parse owner filter
    const ownerId = searchParams.get("ownerId") || undefined

    // Parse year filter
    const yearParam = searchParams.get("year")
    const year = yearParam ? parseInt(yearParam, 10) : undefined

    // Fetch organization settings
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, fiscalYearStartMonth: true, features: true }
    })

    const orgFeatures = (organization?.features as Record<string, any>) || {}
    const advancedBoardTypes = orgFeatures.advancedBoardTypes === true

    // In simplified mode, lazy-generate fiscal year boards
    if (!advancedBoardTypes) {
      await BoardService.generateFiscalYearBoards(
        organizationId,
        organization?.fiscalYearStartMonth ?? 1,
        organization?.timezone ?? "UTC",
        userId
      )
    }

    const boards = await BoardService.getByOrganizationId(organizationId, {
      status,
      cadence: !advancedBoardTypes ? "MONTHLY" as BoardCadence : cadence,
      ownerId,
      year,
      includeTaskInstanceCount: true,
      userId,
      userRole,
      orgActionPermissions: session.user.orgActionPermissions,
    })

    // Return timezone, or null if not configured (don't default to UTC)
    const timezone = organization?.timezone
    const timezoneConfigured = timezone && timezone !== "UTC"

    return NextResponse.json({
      boards,
      organizationTimezone: timezone || null,
      timezoneConfigured,
      advancedBoardTypes,
    })
  } catch (error: any) {
    console.error("[API/boards] Error listing boards:", error)
    return NextResponse.json(
      { error: "Failed to list boards" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/boards - Create a new board (or duplicate an existing one)
 * 
 * Body:
 * - name: string (required)
 * - description?: string
 * - ownerId?: string (defaults to current user)
 * - cadence?: BoardCadence
 * - periodStart?: ISO date string
 * - periodEnd?: ISO date string (optional - derived server-side if not provided)
 * - collaboratorIds?: string[]
 * - automationEnabled?: boolean (defaults to true for non-AD_HOC, false for AD_HOC)
 * - duplicateFromId?: string (if duplicating)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      console.error("[API/boards] Unauthorized - session:", JSON.stringify(session?.user))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "boards:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create boards" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    
    console.log("[API/boards] Creating board for user:", userId, "org:", organizationId)
    
    const body = await request.json()
    console.log("[API/boards] Request body:", JSON.stringify(body))

    const { 
      name, 
      description, 
      ownerId,
      cadence,
      periodStart, 
      periodEnd, 
      collaboratorIds,
      automationEnabled,
      duplicateFromId 
    } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Board name is required" },
        { status: 400 }
      )
    }

    // Check for duplicate name within the organization
    const existingBoard = await prisma.board.findFirst({
      where: { organizationId, name: name.trim() },
      select: { id: true },
    })
    if (existingBoard) {
      return NextResponse.json(
        { error: `A board with the name "${name.trim()}" already exists` },
        { status: 409 }
      )
    }

    // Validate cadence if provided
    const validCadences = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEAR_END", "AD_HOC"]
    if (cadence && !validCadences.includes(cadence)) {
      return NextResponse.json(
        { error: `Invalid cadence. Must be one of: ${validCadences.join(", ")}` },
        { status: 400 }
      )
    }

    // Fetch organization's fiscal year settings for period calculations
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { fiscalYearStartMonth: true }
    })
    const fiscalYearStartMonth = organization?.fiscalYearStartMonth ?? 1

    // Period fields are now optional - boards can be created without time periods
    // Parse and normalize period dates if provided
    const parsedPeriodStart = periodStart ? new Date(periodStart) : undefined
    const normalizedStart = normalizePeriodStart(cadence as BoardCadence, parsedPeriodStart, { fiscalYearStartMonth })
    
    // Derive periodEnd server-side if not provided (or override client value for consistency)
    const derivedEnd = derivePeriodEnd(cadence as BoardCadence, normalizedStart, { fiscalYearStartMonth })
    // Use client-provided periodEnd only if server derivation returns null
    const finalPeriodEnd = derivedEnd || (periodEnd ? new Date(periodEnd) : undefined)

    let board

    // If duplicating from an existing board
    if (duplicateFromId) {
      board = await BoardService.duplicate(
        duplicateFromId,
        organizationId,
        name.trim(),
        userId,
        {
          newOwnerId: ownerId,
          newPeriodStart: normalizedStart || undefined,
          newPeriodEnd: finalPeriodEnd || undefined
        }
      )
    } else {
      // Determine automationEnabled default based on cadence
      // AD_HOC boards never have automation, others default to true
      const finalAutomationEnabled = cadence === "AD_HOC" 
        ? false 
        : (automationEnabled !== undefined ? automationEnabled : true)

      // Create a new board
      const createData = {
        organizationId,
        name: name.trim(),
        description: description?.trim() || undefined,
        ownerId: ownerId || userId, // Default to current user
        cadence: cadence as BoardCadence | undefined,
        periodStart: normalizedStart || undefined,
        periodEnd: finalPeriodEnd || undefined,
        createdById: userId,
        collaboratorIds,
        automationEnabled: finalAutomationEnabled
      }
      console.log("[API/boards] Creating board with data:", JSON.stringify(createData, null, 2))
      
      board = await BoardService.create(createData)
      console.log("[API/boards] Board created successfully:", board.id)
    }

    return NextResponse.json({ board }, { status: 201 })
  } catch (error: any) {
    console.error("[API/boards] Error creating board:", error)
    console.error("[API/boards] Error stack:", error.stack)
    console.error("[API/boards] Error code:", error.code)
    
    // Return more detailed error for debugging
    const errorMessage = error.message || "Unknown error"
    const errorCode = error.code || "UNKNOWN"
    
    return NextResponse.json(
      { 
        error: `Failed to create board: ${errorMessage}`,
        message: errorMessage,
        code: errorCode
      },
      { status: 500 }
    )
  }
}
