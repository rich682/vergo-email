import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BoardService } from "@/lib/services/board.service"
import { BoardCadence } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/boards/current - Get the current month's board ID
 *
 * In simplified (book close) mode, returns the board whose periodStart
 * matches the current month. Used by the sidebar to deep-link directly
 * into the current month's board.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id

    // Fetch org settings
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, fiscalYearStartMonth: true, features: true }
    })

    const orgFeatures = (organization?.features as Record<string, any>) || {}
    const advancedBoardTypes = orgFeatures.advancedBoardTypes === true

    // In simplified mode, ensure fiscal year boards exist
    if (!advancedBoardTypes) {
      await BoardService.generateFiscalYearBoards(
        organizationId,
        organization?.fiscalYearStartMonth ?? 1,
        organization?.timezone ?? "UTC",
        userId
      )
    }

    // Find the board whose periodStart matches the current month
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-indexed

    // periodStart is stored as UTC midnight on the 1st of the month
    const periodStartFrom = new Date(Date.UTC(currentYear, currentMonth, 1))
    const periodStartTo = new Date(Date.UTC(currentYear, currentMonth + 1, 1))

    const currentBoard = await prisma.board.findFirst({
      where: {
        organizationId,
        periodStart: {
          gte: periodStartFrom,
          lt: periodStartTo,
        },
        ...(advancedBoardTypes ? {} : { cadence: "MONTHLY" as BoardCadence }),
      },
      select: { id: true, name: true },
      orderBy: { periodStart: "asc" },
    })

    return NextResponse.json({
      boardId: currentBoard?.id || null,
      boardName: currentBoard?.name || null,
      advancedBoardTypes,
    })
  } catch (error: any) {
    console.error("[API/boards/current] Error:", error)
    return NextResponse.json(
      { error: "Failed to get current board" },
      { status: 500 }
    )
  }
}
