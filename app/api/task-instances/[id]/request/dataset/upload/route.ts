import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { UserRole } from "@prisma/client"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface UploadRequestBody {
  columns: DatasetColumn[]
  rows: DatasetRow[]
  emailColumn: string
  emailColumnKey: string
  validation: DatasetValidation
}

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body: UploadRequestBody = await request.json()
    const { columns, rows, emailColumn, emailColumnKey, validation } = body

    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json({ error: "Invalid columns data" }, { status: 400 })
    }

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid rows data" }, { status: 400 })
    }

    if (!emailColumn) {
      return NextResponse.json({ error: "Email column is required" }, { status: 400 })
    }

    if (rows.length > 5000) {
      return NextResponse.json({ error: "Maximum 5000 rows allowed" }, { status: 400 })
    }

    if (columns.length > 100) {
      return NextResponse.json({ error: "Maximum 100 columns allowed" }, { status: 400 })
    }

    const availableTags = columns.map(c => c.key)
    
    const emailDraft = await prisma.emailDraft.create({
      data: {
        organizationId,
        userId,
        taskInstanceId,
        prompt: `Data Personalization request for ${instance.name}`,
        personalizationMode: "dataset",
        availableTags: availableTags,
        status: "DRAFT",
        suggestedRecipients: {
          type: "dataset",
          emailColumn,
          emailColumnKey,
          columns,
          validation
        }
      }
    })

    const validRows = rows.filter(r => r.valid && r.email)
    
    if (validRows.length > 0) {
      await prisma.personalizationData.createMany({
        data: validRows.map(row => ({
          emailDraftId: emailDraft.id,
          recipientEmail: row.email!.toLowerCase(),
          contactId: null,
          dataJson: row.values,
          renderStatus: null,
          renderErrors: null
        })),
        skipDuplicates: true
      })
    }

    return NextResponse.json({
      success: true,
      draftId: emailDraft.id,
      validationSummary: {
        totalRows: validation.totalRows,
        validEmails: validation.validEmails,
        invalidEmails: validation.invalidEmails,
        duplicates: validation.duplicates
      },
      columns,
      recipientCount: validRows.length
    })

  } catch (error: any) {
    console.error("Dataset upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload dataset", message: error.message },
      { status: 500 }
    )
  }
}
