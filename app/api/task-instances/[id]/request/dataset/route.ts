/**
 * Dataset Update API Endpoint
 * 
 * PATCH /api/task-instances/[id]/request/dataset
 * 
 * Updates dataset structure or row values:
 * - add_column: Add a new column to the dataset
 * - update_rows: Update values for specific recipients
import { normalizeEmail } from "@/lib/utils/email"
 * - update_draft: Update subject/body templates
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { UserRole } from "@prisma/client"
import type { DatasetColumn } from "@/lib/utils/dataset-parser"

type UpdateAction = "add_column" | "update_rows" | "update_draft"

interface AddColumnPayload {
  columnKey: string
  columnLabel: string
  columnType: DatasetColumn["type"]
  defaultValue?: string
}

interface UpdateRowsPayload {
  updates: Array<{
    email: string
    values: Record<string, string>
  }>
}

interface UpdateDraftPayload {
  subject?: string
  body?: string
}

interface UpdateRequestBody {
  draftId: string
  action: UpdateAction
  payload: AddColumnPayload | UpdateRowsPayload | UpdateDraftPayload
}

export async function PATCH(
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
    const userRole = session.user.role || UserRole.MEMBER
    const { id: jobId } = await params

    // Verify task instance exists and user has access
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check edit permission
    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, job, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Parse request body
    const body: UpdateRequestBody = await request.json()
    const { draftId, action, payload } = body

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 }
      )
    }

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      )
    }

    // Fetch the EmailDraft
    const emailDraft = await prisma.emailDraft.findFirst({
      where: {
        id: draftId,
        organizationId,
        taskInstanceId: jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Handle different actions
    switch (action) {
      case "add_column": {
        const { columnKey, columnLabel, columnType, defaultValue } = payload as AddColumnPayload

        if (!columnKey || !columnLabel || !columnType) {
          return NextResponse.json(
            { error: "columnKey, columnLabel, and columnType are required" },
            { status: 400 }
          )
        }

        // Update metadata with new column
        const metadata = emailDraft.suggestedRecipients as any
        const columns: DatasetColumn[] = metadata.columns || []
        
        // Check for duplicate key
        if (columns.some(c => c.key === columnKey)) {
          return NextResponse.json(
            { error: "Column key already exists" },
            { status: 400 }
          )
        }

        columns.push({
          key: columnKey,
          label: columnLabel,
          type: columnType
        })

        // Update availableTags
        const availableTags = emailDraft.availableTags as string[] || []
        if (!availableTags.includes(columnKey)) {
          availableTags.push(columnKey)
        }

        // Update EmailDraft
        await prisma.emailDraft.update({
          where: { id: draftId },
          data: {
            suggestedRecipients: { ...metadata, columns },
            availableTags
          }
        })

        // Update all PersonalizationData records with default value
        if (defaultValue !== undefined) {
          const allData = await prisma.personalizationData.findMany({
            where: { emailDraftId: draftId }
          })

          for (const record of allData) {
            const dataJson = record.dataJson as Record<string, string>
            dataJson[columnKey] = defaultValue
            
            await prisma.personalizationData.update({
              where: { id: record.id },
              data: { dataJson }
            })
          }
        }

        return NextResponse.json({
          success: true,
          message: "Column added successfully",
          columns
        })
      }

      case "update_rows": {
        const { updates } = payload as UpdateRowsPayload

        if (!updates || !Array.isArray(updates)) {
          return NextResponse.json(
            { error: "updates array is required" },
            { status: 400 }
          )
        }

        let updatedCount = 0

        for (const update of updates) {
          const { email, values } = update
          
          if (!email) continue

          const normalizedEmail = normalizeEmail(email) || ""
          
          // Find the PersonalizationData record
          const record = await prisma.personalizationData.findFirst({
            where: {
              emailDraftId: draftId,
              recipientEmail: normalizedEmail
            }
          })

          if (record) {
            const dataJson = record.dataJson as Record<string, string>
            
            // Merge new values
            for (const [key, value] of Object.entries(values)) {
              dataJson[key] = value
            }

            await prisma.personalizationData.update({
              where: { id: record.id },
              data: { 
                dataJson,
                // Clear any previous render since data changed
                renderSubject: null,
                renderBody: null,
                renderStatus: null
              }
            })

            updatedCount++
          }
        }

        return NextResponse.json({
          success: true,
          message: `Updated ${updatedCount} rows`,
          updatedCount
        })
      }

      case "update_draft": {
        const { subject, body: bodyContent } = payload as UpdateDraftPayload

        const updateData: any = {}
        
        if (subject !== undefined) {
          updateData.generatedSubject = subject
          updateData.subjectTemplate = subject
        }
        
        if (bodyContent !== undefined) {
          updateData.generatedBody = bodyContent
          updateData.bodyTemplate = bodyContent
        }

        if (Object.keys(updateData).length === 0) {
          return NextResponse.json(
            { error: "No updates provided" },
            { status: 400 }
          )
        }

        await prisma.emailDraft.update({
          where: { id: draftId },
          data: updateData
        })

        // Clear all rendered previews since template changed
        await prisma.personalizationData.updateMany({
          where: { emailDraftId: draftId },
          data: {
            renderSubject: null,
            renderBody: null,
            renderStatus: null
          }
        })

        return NextResponse.json({
          success: true,
          message: "Draft updated successfully"
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

  } catch (error: any) {
    console.error("Dataset update error:", error)
    return NextResponse.json(
      { error: "Failed to update dataset" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/task-instances/[id]/request/dataset
 * 
 * Retrieves dataset information for a draft
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
    const userRole = session.user.role || UserRole.MEMBER
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

    // Verify task instance exists and user has access
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, job, 'view')
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
        taskInstanceId: jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Fetch all PersonalizationData
    const recipients = await prisma.personalizationData.findMany({
      where: { emailDraftId: draftId },
      orderBy: { recipientEmail: "asc" }
    })

    const metadata = emailDraft.suggestedRecipients as any

    return NextResponse.json({
      success: true,
      draft: {
        id: emailDraft.id,
        subject: emailDraft.subjectTemplate || emailDraft.generatedSubject,
        body: emailDraft.bodyTemplate || emailDraft.generatedBody,
        status: emailDraft.status
      },
      columns: metadata?.columns || [],
      emailColumn: metadata?.emailColumn,
      validation: metadata?.validation,
      recipients: recipients.map(r => ({
        email: r.recipientEmail,
        values: r.dataJson as Record<string, string>,
        renderStatus: r.renderStatus
      }))
    })

  } catch (error: any) {
    console.error("Dataset get error:", error)
    return NextResponse.json(
      { error: "Failed to get dataset" },
      { status: 500 }
    )
  }
}
