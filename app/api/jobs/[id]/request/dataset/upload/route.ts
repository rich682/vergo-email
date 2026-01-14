/**
 * Dataset Upload API Endpoint
 * 
 * POST /api/jobs/[id]/request/dataset/upload
 * 
 * Uploads a parsed dataset for Data Personalization requests.
 * Creates an EmailDraft with personalizationMode: "dataset" and stores
 * recipient data in PersonalizationData records.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
import { UserRole } from "@prisma/client"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface UploadRequestBody {
  columns: DatasetColumn[]
  rows: DatasetRow[]
  emailColumn: string
  emailColumnKey: string
  validation: DatasetValidation
}

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("[Dataset Upload] Starting request...")
  
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    console.log("[Dataset Upload] Session check:", !!session?.user?.id)
    
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

    // Check edit permission
    const canEdit = await JobService.canUserAccessJob(userId, userRole, job, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Parse request body
    console.log("[Dataset Upload] Parsing request body...")
    const body: UploadRequestBody = await request.json()
    const { columns, rows, emailColumn, emailColumnKey, validation } = body
    console.log("[Dataset Upload] Received:", { 
      columnsCount: columns?.length, 
      rowsCount: rows?.length, 
      emailColumn 
    })

    // Validate input
    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json(
        { error: "Invalid columns data" },
        { status: 400 }
      )
    }

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid rows data" },
        { status: 400 }
      )
    }

    if (!emailColumn) {
      return NextResponse.json(
        { error: "Email column is required" },
        { status: 400 }
      )
    }

    // Enforce limits
    if (rows.length > 5000) {
      return NextResponse.json(
        { error: "Maximum 5000 rows allowed" },
        { status: 400 }
      )
    }

    if (columns.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 columns allowed" },
        { status: 400 }
      )
    }

    // Create EmailDraft with dataset mode
    console.log("[Dataset Upload] Creating EmailDraft...")
    const availableTags = columns.map(c => c.key)
    
    const emailDraft = await prisma.emailDraft.create({
      data: {
        organizationId,
        userId,
        jobId,
        prompt: `Data Personalization request for ${job.name}`,
        personalizationMode: "dataset",
        availableTags: availableTags,
        status: "DRAFT",
        // Store dataset metadata in suggestedRecipients JSON field
        suggestedRecipients: {
          type: "dataset",
          emailColumn,
          emailColumnKey,
          columns,
          validation
        }
      }
    })

    // Create PersonalizationData records for each valid row
    console.log("[Dataset Upload] EmailDraft created:", emailDraft.id)
    const validRows = rows.filter(r => r.valid && r.email)
    console.log("[Dataset Upload] Creating PersonalizationData for", validRows.length, "rows...")
    
    if (validRows.length > 0) {
      await prisma.personalizationData.createMany({
        data: validRows.map(row => ({
          emailDraftId: emailDraft.id,
          recipientEmail: row.email.toLowerCase(),
          contactId: null, // Dataset recipients are not linked to contacts
          dataJson: row.values,
          renderStatus: null,
          renderErrors: null
        })),
        skipDuplicates: true
      })
      console.log("[Dataset Upload] PersonalizationData created successfully")
    }

    console.log("[Dataset Upload] Success! Returning response...")
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
