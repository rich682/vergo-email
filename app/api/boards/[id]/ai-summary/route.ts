import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardSummaryService } from "@/lib/services/board-summary.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/boards/[id]/ai-summary
 * Generate an AI-powered summary of board status
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

    const summary = await BoardSummaryService.generateSummary({
      boardId,
      organizationId
    })

    return NextResponse.json(summary)
  } catch (error: any) {
    console.error("[API/boards/[id]/ai-summary] Error:", error)
    
    if (error.message === "Board not found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to generate board summary", message: error.message },
      { status: 500 }
    )
  }
}
