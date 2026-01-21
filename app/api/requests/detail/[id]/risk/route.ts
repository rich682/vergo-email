import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Update risk level for a task (manual override)
 * PUT /api/requests/detail/[id]/risk
 * Body: { riskLevel: "high" | "medium" | "low", overrideReason?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { riskLevel, overrideReason } = body

    if (!riskLevel || !["high", "medium", "low", "unknown"].includes(riskLevel)) {
      return NextResponse.json(
        { error: "Invalid riskLevel. Must be 'high', 'medium', 'low', or 'unknown'" },
        { status: 400 }
      )
    }

    // Find the request
    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Update task with manual risk override
    // If riskLevel is null or "unknown", clear the override
    const manualRiskOverride = riskLevel === "unknown" ? null : riskLevel
    const overrideReasonValue = manualRiskOverride ? (overrideReason || "Manual override") : null

    const updatedTask = await prisma.request.update({
      where: { id: task.id },
      data: {
        manualRiskOverride: manualRiskOverride as any,
        overrideReason: overrideReasonValue,
        riskLevel: manualRiskOverride as any, // Also update riskLevel for immediate display
        riskReason: overrideReasonValue || task.riskReason || null
      }
    })

    return NextResponse.json({
      success: true,
      task: {
        id: updatedTask.id,
        riskLevel: updatedTask.riskLevel,
        manualRiskOverride: updatedTask.manualRiskOverride,
        overrideReason: updatedTask.overrideReason,
        riskReason: updatedTask.riskReason
      }
    })
  } catch (error: any) {
    console.error("Error updating risk:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update risk" },
      { status: 500 }
    )
  }
}


