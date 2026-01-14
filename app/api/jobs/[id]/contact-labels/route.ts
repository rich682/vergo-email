import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobLabelService } from "@/lib/services/job-label.service"
import { prisma } from "@/lib/prisma"

// GET /api/jobs/[id]/contact-labels - List contacts with their labels
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const contacts = await JobLabelService.getContactsWithLabels(jobId, organizationId)

    return NextResponse.json({
      success: true,
      contacts,
    })
  } catch (error: any) {
    console.error("List contact labels error:", error)
    return NextResponse.json(
      { error: "Failed to list contact labels", message: error.message },
      { status: 500 }
    )
  }
}

// POST /api/jobs/[id]/contact-labels - Apply label to contacts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { jobLabelId, entityIds, metadata } = body as {
      jobLabelId: string
      entityIds: string[]
      metadata?: Record<string, string | number | null>
    }

    if (!jobLabelId || typeof jobLabelId !== "string") {
      return NextResponse.json(
        { error: "jobLabelId is required" },
        { status: 400 }
      )
    }

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { error: "entityIds must be a non-empty array" },
        { status: 400 }
      )
    }

    // Verify label belongs to this job
    const label = await JobLabelService.getLabelById(jobLabelId, organizationId)
    if (!label || label.jobId !== jobId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    // Verify all entities belong to the organization
    const entities = await prisma.entity.findMany({
      where: {
        id: { in: entityIds },
        organizationId,
      },
      select: { id: true },
    })

    const validEntityIds = entities.map((e) => e.id)
    const invalidIds = entityIds.filter((id) => !validEntityIds.includes(id))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid entity IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      )
    }

    const contactLabels = await JobLabelService.applyLabelToContacts({
      jobLabelId,
      entityIds: validEntityIds,
      metadata,
    })

    return NextResponse.json({
      success: true,
      applied: contactLabels.length,
      contactLabels,
    })
  } catch (error: any) {
    console.error("Apply contact label error:", error)
    return NextResponse.json(
      { error: "Failed to apply label", message: error.message },
      { status: 500 }
    )
  }
}

// DELETE /api/jobs/[id]/contact-labels - Remove label from contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { jobLabelId, entityId } = body as {
      jobLabelId: string
      entityId: string
    }

    if (!jobLabelId || typeof jobLabelId !== "string") {
      return NextResponse.json(
        { error: "jobLabelId is required" },
        { status: 400 }
      )
    }

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      )
    }

    // Verify label belongs to this job
    const label = await JobLabelService.getLabelById(jobLabelId, organizationId)
    if (!label || label.jobId !== jobId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    const removed = await JobLabelService.removeLabelFromContact(jobLabelId, entityId)

    if (!removed) {
      return NextResponse.json(
        { error: "Contact label not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Label removed from contact",
    })
  } catch (error: any) {
    console.error("Remove contact label error:", error)
    return NextResponse.json(
      { error: "Failed to remove label", message: error.message },
      { status: 500 }
    )
  }
}

// PATCH /api/jobs/[id]/contact-labels - Update metadata for a contact label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { contactLabelId, metadata } = body as {
      contactLabelId: string
      metadata: Record<string, string | number | null>
    }

    if (!contactLabelId || typeof contactLabelId !== "string") {
      return NextResponse.json(
        { error: "contactLabelId is required" },
        { status: 400 }
      )
    }

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json(
        { error: "metadata is required and must be an object" },
        { status: 400 }
      )
    }

    // Verify the contact label exists and belongs to this job
    const contactLabel = await prisma.jobContactLabel.findUnique({
      where: { id: contactLabelId },
      include: {
        jobLabel: {
          select: { jobId: true, organizationId: true },
        },
      },
    })

    if (!contactLabel || contactLabel.jobLabel.jobId !== jobId || contactLabel.jobLabel.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Contact label not found" },
        { status: 404 }
      )
    }

    const updated = await JobLabelService.updateContactLabelMetadata(contactLabelId, metadata)

    return NextResponse.json({
      success: true,
      contactLabel: updated,
    })
  } catch (error: any) {
    console.error("Update contact label metadata error:", error)
    return NextResponse.json(
      { error: "Failed to update metadata", message: error.message },
      { status: 500 }
    )
  }
}
