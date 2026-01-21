import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * POST /api/task-instances/[id]/reconciliations/[reconciliationId]/save-template
 * Save a completed reconciliation as a recurring template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; reconciliationId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id
    const reconciliationId = params.reconciliationId

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true, name: true }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Fetch reconciliation
    const reconciliation = await prisma.reconciliation.findFirst({
      where: {
        id: reconciliationId,
        taskInstanceId: jobId,
        organizationId
      }
    })

    if (!reconciliation) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    if (reconciliation.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Can only create template from completed reconciliation" },
        { status: 400 }
      )
    }

    // Check if template already exists for this task name
    const existingTemplate = await prisma.reconciliationTemplate.findFirst({
      where: {
        organizationId,
        name: job.name
      }
    })

    if (existingTemplate) {
      // Update existing template
      const updated = await prisma.reconciliationTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          anchorRole: reconciliation.anchorRole || "Source Document",
          supportingRoles: getSupportingRoles(reconciliation),
          defaultIntent: getReconciliationIntent(reconciliation),
          priorExplanation: reconciliation.summary || undefined,
          updatedAt: new Date()
        }
      })

      // Link reconciliation to template
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: { templateId: updated.id }
      })

      return NextResponse.json({ 
        template: updated,
        message: "Template updated successfully" 
      })
    }

    // Create new template
    const template = await prisma.reconciliationTemplate.create({
      data: {
        organizationId,
        name: job.name,
        anchorRole: reconciliation.anchorRole || "Source Document",
        supportingRoles: getSupportingRoles(reconciliation),
        defaultIntent: getReconciliationIntent(reconciliation),
        priorExplanation: reconciliation.summary || undefined,
        isActive: true
      }
    })

    // Link reconciliation to template
    await prisma.reconciliation.update({
      where: { id: reconciliationId },
      data: { templateId: template.id }
    })

    return NextResponse.json({ 
      template,
      message: "Template created successfully"
    }, { status: 201 })
  } catch (error: any) {
    console.error("[API/reconciliations/save-template] Error:", error)
    return NextResponse.json(
      { error: "Failed to save template", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * Extract supporting document roles from reconciliation
 */
function getSupportingRoles(reconciliation: any): string[] {
  const roles: string[] = []
  
  // First supporting document
  if (reconciliation.document2Name) {
    roles.push("Supporting Document 1")
  }
  
  // Additional supporting documents
  const additionalDocs = reconciliation.supportingDocuments as any[]
  if (additionalDocs && Array.isArray(additionalDocs)) {
    for (let i = 0; i < additionalDocs.length; i++) {
      roles.push(`Supporting Document ${i + 2}`)
    }
  }
  
  return roles.length > 0 ? roles : ["Supporting Document"]
}

/**
 * Extract reconciliation intent type from result
 */
function getReconciliationIntent(reconciliation: any): string | null {
  const result = reconciliation.result as any
  if (result?.reconciliationIntent?.type) {
    return result.reconciliationIntent.type
  }
  if (result?.reconciliationType) {
    return result.reconciliationType
  }
  return null
}
