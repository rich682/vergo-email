import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { put } from "@vercel/blob"
import { 
  RECONCILIATION_LIMITS, 
  RECONCILIATION_MESSAGES,
  isStructuredFile 
} from "@/lib/constants/reconciliation"
import { ReconciliationProcessorService } from "@/lib/services/reconciliation-processor.service"
import * as XLSX from "xlsx"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/reconciliations - List all reconciliations for a job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const reconciliations = await prisma.reconciliation.findMany({
      where: { taskInstanceId: jobId, organizationId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    // Transform to include anchor/supporting terminology and V1 fields
    const transformedReconciliations = reconciliations.map(r => ({
      ...r,
      // Computed fields for anchor model
      isAnchored: true,
      anchorDocument: {
        name: r.document1Name,
        url: r.document1Url,
        size: r.document1Size,
        mimeType: r.document1MimeType
      },
      // First supporting is document2, additional ones in supportingDocuments
      allSupportingDocuments: [
        { 
          name: r.document2Name, 
          url: r.document2Url, 
          size: r.document2Size, 
          mimeType: r.document2MimeType,
          uploadOrder: 1 
        },
        ...(((r as any).supportingDocuments as any[]) || [])
      ],
      // V1 enhanced output
      v1Output: r.confidenceScore !== null ? {
        confidenceScore: r.confidenceScore,
        confidenceLabel: r.confidenceScore >= 80 ? "High" : r.confidenceScore >= 50 ? "Medium" : "Low",
        keyFindings: r.keyFindings,
        suggestedNextSteps: r.suggestedNextSteps
      } : null
    }))

    return NextResponse.json({ reconciliations: transformedReconciliations })
  } catch (error: any) {
    console.error("[API/jobs/[id]/reconciliations] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch reconciliations", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/task-instances/[id]/reconciliations - Create a new reconciliation
 * 
 * Supports two formats for backwards compatibility:
 * 1. NEW (anchor model): anchor + supporting[] + intentDescription
 * 2. LEGACY: document1 + document2
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const jobId = params.id

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    
    // Check which format is being used
    const anchorFile = formData.get("anchor") as File | null
    const supportingFiles = formData.getAll("supporting") as File[]
    const intentDescription = formData.get("intentDescription") as string | null
    const anchorRole = formData.get("anchorRole") as string | null
    
    // Legacy format support
    const document1 = formData.get("document1") as File | null
    const document2 = formData.get("document2") as File | null

    // Determine which format we're using
    let anchor: File
    let supporting: File[]
    let isLegacyFormat = false

    if (anchorFile && supportingFiles.length > 0) {
      // New anchor model format
      anchor = anchorFile
      supporting = supportingFiles
    } else if (document1 && document2) {
      // Legacy format - treat document1 as anchor, document2 as supporting
      anchor = document1
      supporting = [document2]
      isLegacyFormat = true
    } else {
      return NextResponse.json(
        { error: "Please upload an anchor document and at least one supporting document" },
        { status: 400 }
      )
    }

    // V1: Validate file types - Excel, CSV, PDF, or images
    const isValidType = (file: File) => {
      // Check MIME type
      if (RECONCILIATION_LIMITS.ALLOWED_MIME_TYPES.includes(file.type)) return true
      // Fallback to extension check
      const ext = file.name.split(".").pop()?.toLowerCase()
      const allowedExts = RECONCILIATION_LIMITS.ALLOWED_EXTENSIONS.map(e => e.replace(".", ""))
      return allowedExts.includes(ext || "")
    }

    // Validate anchor
    if (!isValidType(anchor)) {
      return NextResponse.json(
        { error: `Anchor document: ${RECONCILIATION_MESSAGES.INVALID_FILE_TYPE}` },
        { status: 400 }
      )
    }
    if (anchor.size > RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Anchor document: ${RECONCILIATION_MESSAGES.FILE_TOO_LARGE}` },
        { status: 413 }
      )
    }

    // Validate supporting documents
    for (let i = 0; i < supporting.length; i++) {
      const file = supporting[i]
      if (!isValidType(file)) {
        return NextResponse.json(
          { error: `Supporting document ${i + 1}: ${RECONCILIATION_MESSAGES.INVALID_FILE_TYPE}` },
          { status: 400 }
        )
      }
      if (file.size > RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Supporting document ${i + 1}: ${RECONCILIATION_MESSAGES.FILE_TOO_LARGE}` },
          { status: 413 }
        )
      }
    }

    // Validate sheet count for Excel files only (must have exactly 1 sheet)
    // V1: PDF and images don't need sheet validation
    const validateSheetCount = async (file: File, docName: string): Promise<string | null> => {
      const ext = file.name.split(".").pop()?.toLowerCase()
      // Skip validation for non-spreadsheet files
      if (!["xls", "xlsx"].includes(ext || "")) return null
      
      try {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: "array", bookSheets: true })
        const sheetCount = workbook.SheetNames.length
        
        if (sheetCount > 1) {
          return `${docName} contains ${sheetCount} sheets. ${RECONCILIATION_MESSAGES.MULTIPLE_SHEETS}`
        }
        return null
      } catch (error) {
        return null
      }
    }

    // Validate anchor sheet count (only for Excel)
    const anchorSheetError = await validateSheetCount(anchor, "Anchor document")
    if (anchorSheetError) {
      return NextResponse.json({ error: anchorSheetError }, { status: 400 })
    }

    // Validate supporting docs sheet count (only for Excel)
    for (let i = 0; i < supporting.length; i++) {
      const sheetError = await validateSheetCount(supporting[i], `Supporting document ${i + 1}`)
      if (sheetError) {
        return NextResponse.json({ error: sheetError }, { status: 400 })
      }
    }

    // Upload documents to blob storage
    const timestamp = Date.now()
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9.-]/g, "_")

    // Upload anchor
    const anchorBlob = await put(
      `reconciliations/${organizationId}/${jobId}/${timestamp}_anchor_${sanitize(anchor.name)}`,
      anchor,
      { access: "public" }
    )

    // Upload all supporting documents
    const supportingBlobs = await Promise.all(
      supporting.map((file, i) =>
        put(
          `reconciliations/${organizationId}/${jobId}/${timestamp}_supporting_${i}_${sanitize(file.name)}`,
          file,
          { access: "public" }
        )
      )
    )

    // Build supporting documents array for storage
    // First supporting goes in document2 fields (backwards compat)
    // Additional ones go in supportingDocuments JSON field
    const additionalSupportingDocs = supportingBlobs.slice(1).map((blob, i) => ({
      key: blob.url,
      name: supporting[i + 1].name,
      url: blob.url,
      size: supporting[i + 1].size,
      mimeType: supporting[i + 1].type, // V1: Store MIME type
      uploadOrder: i + 2 // 1-indexed, first supporting is order 1 in document2 fields
    }))

    // Get board info for boardPeriodName
    const jobWithBoard = await prisma.taskInstance.findUnique({
      where: { id: jobId },
      include: { board: true }
    })
    const boardPeriodName = jobWithBoard?.board 
      ? `${jobWithBoard.board.name}${jobWithBoard.board.periodStart ? ` (${jobWithBoard.board.periodStart.toISOString().split("T")[0]})` : ""}`
      : undefined

    // Create reconciliation record with V1 fields
    const reconciliation = await prisma.reconciliation.create({
      data: {
        organizationId,
        taskInstanceId: jobId,
        // Anchor = document1 (backwards compat)
        document1Key: anchorBlob.url,
        document1Name: anchor.name,
        document1Url: anchorBlob.url,
        document1Size: anchor.size,
        document1MimeType: anchor.type, // V1: Store MIME type
        // First supporting = document2 (backwards compat)
        document2Key: supportingBlobs[0].url,
        document2Name: supporting[0].name,
        document2Url: supportingBlobs[0].url,
        document2Size: supporting[0].size,
        document2MimeType: supporting[0].type, // V1: Store MIME type
        // Additional supporting documents
        supportingDocuments: additionalSupportingDocs.length > 0 ? additionalSupportingDocs : undefined,
        // V1: Accounting context
        anchorRole: anchorRole || undefined,
        boardPeriodName,
        status: "PENDING",
        createdById: userId
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    // Auto-run V1 reconciliation processing with intent and anchor role
    let processingResult = null
    let processingError = null
    try {
      // V1: Use enhanced processor with accounting context
      processingResult = await ReconciliationProcessorService.processV1Reconciliation(
        reconciliation.id,
        anchorRole || undefined,
        intentDescription || undefined
      )
    } catch (error: any) {
      console.error("[API/reconciliations] V1 auto-processing failed:", error.message)
      processingError = error.message
    }

    // Fetch updated reconciliation with results
    const updatedReconciliation = await prisma.reconciliation.findUnique({
      where: { id: reconciliation.id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    return NextResponse.json({ 
      reconciliation: {
        ...updatedReconciliation,
        // Include anchor model info
        isAnchored: true,
        anchorDocument: {
          name: anchor.name,
          url: anchorBlob.url,
          size: anchor.size,
          mimeType: anchor.type
        },
        allSupportingDocuments: supporting.map((file, i) => ({
          name: file.name,
          url: supportingBlobs[i].url,
          size: file.size,
          mimeType: file.type,
          uploadOrder: i + 1
        }))
      },
      autoProcessed: true,
      isLegacyFormat,
      processingResult: processingResult?.success ? {
        summary: processingResult.explanation,
        matchedCount: processingResult.matchedCount,
        unmatchedCount: processingResult.unmatchedCount,
        // V1 enhanced output
        confidenceScore: processingResult.confidenceScore,
        confidenceLabel: processingResult.confidenceLabel,
        keyFindings: processingResult.keyFindings,
        suggestedNextSteps: processingResult.suggestedNextSteps,
        reconciliationType: processingResult.reconciliationType,
        anchorSummary: processingResult.anchorSummary,
        supportingSummaries: processingResult.supportingSummaries
      } : null,
      processingError: processingError || (processingResult?.error || null)
    }, { status: 201 })
  } catch (error: any) {
    console.error("[API/jobs/[id]/reconciliations] Error creating:", error)
    return NextResponse.json(
      { error: "Failed to create reconciliation", message: error.message },
      { status: 500 }
    )
  }
}
