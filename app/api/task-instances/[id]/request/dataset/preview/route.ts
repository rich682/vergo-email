/**
 * Dataset Preview API Endpoint
 * 
 * POST /api/task-instances/[id]/request/dataset/preview
 * 
 * Renders the email template for a specific recipient, resolving merge fields.
 * Returns rendered content and highlights missing fields.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
import { UserRole } from "@prisma/client"
import { renderTemplate, findMissingPlaceholders } from "@/lib/utils/template-renderer"

interface PreviewRequestBody {
  draftId: string
  email: string
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

    // Verify job exists and user has access
    const job = await JobService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await JobService.canUserAccessJob(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Parse request body
    const body: PreviewRequestBody = await request.json()
    const { draftId, email } = body

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Fetch the EmailDraft
    const emailDraft = await prisma.emailDraft.findFirst({
      where: {
        id: draftId,
        organizationId,
        jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Get subject and body templates
    const subjectTemplate = emailDraft.subjectTemplate || emailDraft.generatedSubject || ""
    const bodyTemplate = emailDraft.bodyTemplate || emailDraft.generatedBody || ""

    if (!subjectTemplate && !bodyTemplate) {
      return NextResponse.json(
        { error: "No draft content to preview. Generate a draft first." },
        { status: 400 }
      )
    }

    // Fetch the recipient's PersonalizationData
    const recipientData = await prisma.personalizationData.findFirst({
      where: {
        emailDraftId: draftId,
        recipientEmail: normalizedEmail
      }
    })

    if (!recipientData) {
      return NextResponse.json(
        { error: "Recipient not found in dataset" },
        { status: 404 }
      )
    }

    // Get recipient's data values
    const dataJson = recipientData.dataJson as Record<string, string>

    // Add email to data for potential use in templates
    const renderData = {
      ...dataJson,
      email: normalizedEmail
    }

    // Render subject and body
    const subjectResult = renderTemplate(subjectTemplate, renderData)
    const bodyResult = renderTemplate(bodyTemplate, renderData)

    // Combine missing fields from both
    const allMissingFields = [...new Set([
      ...subjectResult.missingTags,
      ...bodyResult.missingTags
    ])]

    // Also check for [MISSING: ...] placeholders in rendered content
    const missingInSubject = findMissingPlaceholders(subjectResult.rendered)
    const missingInBody = findMissingPlaceholders(bodyResult.rendered)
    const missingPlaceholders = [...new Set([...missingInSubject, ...missingInBody])]

    // Determine render status
    let renderStatus: "ok" | "missing" | "failed" = "ok"
    if (allMissingFields.length > 0 || missingPlaceholders.length > 0) {
      renderStatus = "missing"
    }

    // Update PersonalizationData with rendered content
    await prisma.personalizationData.update({
      where: { id: recipientData.id },
      data: {
        renderSubject: subjectResult.rendered,
        renderBody: bodyResult.rendered,
        renderStatus,
        renderErrors: allMissingFields.length > 0 
          ? allMissingFields 
          : null
      }
    })

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      renderedSubject: subjectResult.rendered,
      renderedBody: bodyResult.rendered,
      missingFields: allMissingFields,
      missingPlaceholders,
      usedFields: [...new Set([...subjectResult.usedTags, ...bodyResult.usedTags])],
      renderStatus,
      recipientData: dataJson
    })

  } catch (error: any) {
    console.error("Dataset preview error:", error)
    return NextResponse.json(
      { error: "Failed to generate preview", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/task-instances/[id]/request/dataset/preview
 * 
 * Batch preview for all recipients (returns summary, not full renders)
 */
export async function GET(
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

    // Get draftId from query params
    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get("draftId")

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId query parameter is required" },
        { status: 400 }
      )
    }

    // Verify job exists and user has access
    const job = await JobService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await JobService.canUserAccessJob(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Fetch the EmailDraft
    const emailDraft = await prisma.emailDraft.findFirst({
      where: {
        id: draftId,
        organizationId,
        jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Get all recipients with their render status
    const recipients = await prisma.personalizationData.findMany({
      where: { emailDraftId: draftId },
      select: {
        recipientEmail: true,
        renderStatus: true,
        renderErrors: true,
        dataJson: true
      },
      orderBy: { recipientEmail: "asc" }
    })

    // Calculate summary
    const total = recipients.length
    const rendered = recipients.filter(r => r.renderStatus !== null).length
    const ok = recipients.filter(r => r.renderStatus === "ok").length
    const missing = recipients.filter(r => r.renderStatus === "missing").length
    const failed = recipients.filter(r => r.renderStatus === "failed").length

    return NextResponse.json({
      success: true,
      summary: {
        total,
        rendered,
        ok,
        missing,
        failed,
        pending: total - rendered
      },
      recipients: recipients.map(r => ({
        email: r.recipientEmail,
        renderStatus: r.renderStatus,
        hasErrors: r.renderErrors !== null,
        // Include first few data fields for display
        preview: Object.entries(r.dataJson as Record<string, string>)
          .slice(0, 3)
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
      }))
    })

  } catch (error: any) {
    console.error("Dataset preview summary error:", error)
    return NextResponse.json(
      { error: "Failed to get preview summary", message: error.message },
      { status: 500 }
    )
  }
}
