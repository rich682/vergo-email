import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService } from "@/lib/services/board.service"
import { BoardStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/boards - List all boards for the organization
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

    const boards = await BoardService.getByOrganizationId(organizationId, {
      status,
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
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const body = await request.json()

    const { name, description, periodStart, periodEnd, duplicateFromId } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Board name is required" },
        { status: 400 }
      )
    }

    let board

    // If duplicating from an existing board
    if (duplicateFromId) {
      board = await BoardService.duplicate(
        duplicateFromId,
        organizationId,
        name.trim(),
        userId
      )
    } else {
      // Create a new board
      board = await BoardService.create({
        organizationId,
        name: name.trim(),
        description: description?.trim() || undefined,
        periodStart: periodStart ? new Date(periodStart) : undefined,
        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        createdById: userId
      })
    }

    return NextResponse.json({ board }, { status: 201 })
  } catch (error: any) {
    console.error("[API/boards] Error creating board:", error)
    return NextResponse.json(
      { error: "Failed to create board", message: error.message },
      { status: 500 }
    )
  }
}
