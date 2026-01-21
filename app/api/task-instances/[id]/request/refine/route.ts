/**
 * Job Request Refine Endpoint
 * 
 * POST /api/task-instances/[id]/request/refine - Refine draft email based on user instruction
 * 
 * This is a thin helper that revises subject/body based on user instruction.
 * It does NOT create any EmailDraft/Quest/Task records.
 * 
 * Execution uses existing Quest endpoints:
 * - POST /api/quests (create)
 * - POST /api/quests/[id]/execute (send)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

interface RefineRequest {
  instruction: string
  currentDraft: {
    subject: string
    body: string
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: jobId } = await params

    // Parse request body
    const body: RefineRequest = await request.json()
    const { instruction, currentDraft } = body

    if (!instruction || !instruction.trim()) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      )
    }

    if (!currentDraft || !currentDraft.subject || !currentDraft.body) {
      return NextResponse.json(
        { error: "Current draft (subject and body) is required" },
        { status: 400 }
      )
    }

    // Fetch task instance to verify access and get context
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check view permission (required to refine draft)
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Get user info for signature
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, signature: true }
    })

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })

    // Build signature
    let senderSignature: string | undefined
    if (user?.signature && user.signature.trim() !== '') {
      senderSignature = user.signature
    } else {
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (organization?.name) signatureParts.push(organization.name)
      if (user?.email) signatureParts.push(user.email)
      senderSignature = signatureParts.length > 0 ? signatureParts.join('\n') : undefined
    }

    // Build refinement prompt
    const labels = job.labels as any
    
    let prompt = `Revise the following email based on this instruction: "${instruction.trim()}"

Keep the same professional tone and structure. Only make changes that address the instruction.

CURRENT EMAIL:
Subject: ${currentDraft.subject}

Body:
${currentDraft.body}

ITEM CONTEXT:
Item: ${job.name}`

    if (job.description) {
      prompt += `
Description: ${job.description}`
    }

    if (job.dueDate) {
      const formattedDate = job.dueDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      prompt += `
Due Date: ${formattedDate}`
    }

    if (labels?.tags && labels.tags.length > 0) {
      prompt += `
Labels: ${labels.tags.join(', ')}`
    }

    prompt += `

INSTRUCTION: ${instruction.trim()}

Generate the revised email with the requested changes.`

    // Generate refined draft
    try {
      const generated = await AIEmailGenerationService.generateDraft({
        organizationId,
        prompt,
        senderName: user?.name || undefined,
        senderEmail: user?.email || undefined,
        senderCompany: organization?.name || undefined,
        senderSignature,
        deadlineDate: job.dueDate,
        personalizationMode: "contact",
        availableTags: ["First Name", "Email"]
      })

      return NextResponse.json({
        success: true,
        draft: {
          subject: generated.subjectTemplate || generated.subject,
          body: generated.bodyTemplate || generated.body
        }
      })
    } catch (error: any) {
      console.error("AI refinement failed:", error.message)
      // On AI failure, return original draft with error indicator
      return NextResponse.json({
        success: true,
        draft: currentDraft,
        refinementFailed: true,
        message: "AI refinement failed. Original draft preserved."
      })
    }

  } catch (error: any) {
    console.error("Job request refine error:", error)
    return NextResponse.json(
      { error: "Failed to refine draft", message: error.message },
      { status: 500 }
    )
  }
}
