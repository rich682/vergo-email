import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardCloseSummaryService } from "@/lib/services/board-close-summary.service"

export const maxDuration = 30
export const dynamic = "force-dynamic"

/**
 * GET /api/boards/[id]/close-summary
 * Generate an AI-powered close retrospective for a completed board.
 * Analyzes which tasks were blockers, what missed target dates,
 * and provides recommendations for faster closes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const boardId = params.id

    const result = await BoardCloseSummaryService.generateCloseSummary({
      boardId,
      organizationId,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[API/boards/[id]/close-summary] Error:", error)

    if (error.message === "Board not found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    if (error.message === "Board is not closed") {
      return NextResponse.json({ error: "Board is not closed yet" }, { status: 400 })
    }

    return NextResponse.json(
      { error: "Failed to generate close summary" },
      { status: 500 }
    )
  }
}
