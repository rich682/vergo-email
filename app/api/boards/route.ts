import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService, derivePeriodEnd, normalizePeriodStart } from "@/lib/services/board.service"
import { BoardStatus, BoardCadence } from "@prisma/client"

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
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
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

    const boards = await BoardService.getByOrganizationId(organizationId, {
      status,
      cadence,
      ownerId,
      year,
      includeJobCount: true
    })

    return NextResponse.json({ boards })
  } catch (error: any) {
    console.error("[API/boards] Error listing boards:", error)
    return NextResponse.json(
      { error: "Failed to list boards", message: error.message },
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

    // Validate cadence if provided
    const validCadences = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEAR_END", "AD_HOC"]
    if (cadence && !validCadences.includes(cadence)) {
      return NextResponse.json(
        { error: `Invalid cadence. Must be one of: ${validCadences.join(", ")}` },
        { status: 400 }
      )
    }

    // Period fields are now optional - boards can be created without time periods
    // Parse and normalize period dates if provided
    const parsedPeriodStart = periodStart ? new Date(periodStart) : undefined
    const normalizedStart = normalizePeriodStart(cadence as BoardCadence, parsedPeriodStart)
    
    // Derive periodEnd server-side if not provided (or override client value for consistency)
    const derivedEnd = derivePeriodEnd(cadence as BoardCadence, normalizedStart)
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
