/**
 * Agent Feedback API
 *
 * POST /api/agents/[agentId]/executions/[executionId]/feedback — Submit correction/approval
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { handleCorrection } from "@/lib/agents/learning/correction-handler"

interface RouteParams {
  params: { agentId: string; executionId: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:execute", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { feedbackType, originalValue, correctedValue } = body

    if (!feedbackType || !["correction", "approval", "rejection"].includes(feedbackType)) {
      return NextResponse.json({ error: "Valid feedbackType required" }, { status: 400 })
    }

    // Create feedback record
    const feedback = await prisma.agentFeedback.create({
      data: {
        organizationId: session.user.organizationId,
        executionId: params.executionId,
        feedbackType,
        originalValue: originalValue || null,
        correctedValue: correctedValue || undefined,
        correctedBy: session.user.id,
      },
    })

    // Process correction into memory updates
    const execution = await prisma.agentExecution.findUnique({
      where: { id: params.executionId },
      select: { agentDefinitionId: true },
    })

    let correctionResult = null
    if (execution) {
      correctionResult = await handleCorrection({
        executionId: params.executionId,
        organizationId: session.user.organizationId,
        agentDefinitionId: execution.agentDefinitionId,
        feedbackType,
        originalValue: originalValue || {},
        correctedValue: correctedValue || undefined,
        correctedBy: session.user.id,
      })
    }

    return NextResponse.json({
      feedback,
      ...(correctionResult || {}),
    })
  } catch (error) {
    console.error("Error submitting feedback:", error)
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 })
  }
}
