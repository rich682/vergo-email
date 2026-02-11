/**
 * POST /api/reconciliations/[configId]/runs/[runId]/upload
 * Upload a source file (A or B), parse it, and save parsed rows to the run.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { ReconciliationFileParserService } from "@/lib/services/reconciliation-file-parser.service"
import { getStorageService } from "@/lib/services/storage.service"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 60
interface RouteParams {
  params: Promise<{ configId: string; runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId, runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to upload reconciliation files" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Parse multipart form
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const source = formData.get("source") as string | null

    if (!file || !source || !["A", "B"].includes(source)) {
      return NextResponse.json(
        { error: 'File and source ("A" or "B") are required' },
        { status: 400 }
      )
    }

    // Get config for column mapping
    const config = await ReconciliationService.getConfig(configId, user.organizationId)
    if (!config) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    // Verify run exists
    const run = await ReconciliationService.getRun(runId, user.organizationId)
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse the file
    const sourceConfig = source === "A"
      ? (config.sourceAConfig as any)
      : (config.sourceBConfig as any)

    const parseResult = await ReconciliationFileParserService.parseFile(
      buffer,
      file.name,
      sourceConfig?.columns?.length > 0 ? sourceConfig : undefined,
      "full" // Need all rows for actual reconciliation
    )

    // Store file in blob storage
    const storage = getStorageService()
    const fileKey = `reconciliations/${configId}/${runId}/${source}-${Date.now()}-${file.name}`
    await storage.upload(buffer, fileKey, file.type)

    // Save parsed data to run
    await ReconciliationService.updateRunSource(runId, user.organizationId, source as "A" | "B", {
      fileKey,
      fileName: file.name,
      rows: parseResult.rows,
      totalRows: parseResult.rowCount,
    })

    // Auto-detect column types if this is the first upload and config has no columns
    let detectedTypes = null
    if (!sourceConfig?.columns?.length) {
      detectedTypes = ReconciliationFileParserService.detectColumnTypes(parseResult.detectedColumns)
    }

    return NextResponse.json({
      success: true,
      rowCount: parseResult.rowCount,
      detectedColumns: parseResult.detectedColumns,
      detectedTypes,
      warnings: parseResult.warnings,
    })
  } catch (error: any) {
    console.error("[Reconciliations] Error uploading file:", error)
    return NextResponse.json(
      { error: "Failed to upload and parse file" },
      { status: 500 }
    )
  }
}
