/**
 * POST /api/reconciliations/[configId]/generate-test
 * Creates a run, uploads both source files, and triggers matching — all server-side.
 * Accepts multipart form with files (sourceA, sourceB) for file-based sources.
 * For database sources, loads data from the configured database.
 * Returns immediately with the run ID — processing happens asynchronously via streaming.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ReconciliationService, type SourceConfig } from "@/lib/services/reconciliation.service"
import { ReconciliationFileParserService } from "@/lib/services/reconciliation-file-parser.service"
import { ReconciliationMatchingService } from "@/lib/services/reconciliation-matching.service"
import { getStorageService } from "@/lib/services/storage.service"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

export const maxDuration = 300

interface RouteParams {
  params: Promise<{ configId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { configId } = await params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "No permission" }, { status: 403 })
    }

    // Get config
    const config = await ReconciliationService.getConfig(configId, session.user.organizationId)
    if (!config) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    const sourceAConfig = config.sourceAConfig as unknown as SourceConfig
    const sourceBConfig = config.sourceBConfig as unknown as SourceConfig

    // Parse form data — expect sourceA and sourceB files
    const formData = await request.formData()
    const fileA = formData.get("sourceA") as File | null
    const fileB = formData.get("sourceB") as File | null

    // Validate: file-based sources need files
    if (sourceAConfig.sourceType !== "database" && !fileA) {
      return NextResponse.json({ error: "Source A file is required" }, { status: 400 })
    }
    if (sourceBConfig.sourceType !== "database" && !fileB) {
      return NextResponse.json({ error: "Source B file is required" }, { status: 400 })
    }

    // Create the run
    const run = await ReconciliationService.createRun({
      configId,
      organizationId: session.user.organizationId,
    })

    // Update status to PROCESSING
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: { status: "PROCESSING" },
    })

    // Parse and upload Source A
    let sourceARows: Record<string, any>[] = []
    if (fileA) {
      const bufferA = Buffer.from(await fileA.arrayBuffer())
      const parseA = await ReconciliationFileParserService.parseFile(
        bufferA, fileA.name,
        sourceAConfig.columns?.length > 0 ? sourceAConfig : undefined,
        "full", sourceAConfig.extractionProfile
      )
      sourceARows = parseA.rows

      // Store file
      const storage = getStorageService()
      const keyA = `reconciliations/${configId}/${run.id}/A-${Date.now()}-${fileA.name}`
      await storage.upload(bufferA, keyA, fileA.type)

      await ReconciliationService.updateRunSource(run.id, session.user.organizationId, "A", {
        fileKey: keyA, fileName: fileA.name, rows: parseA.rows, totalRows: parseA.rowCount,
      })
    }

    // Parse and upload Source B
    let sourceBRows: Record<string, any>[] = []
    if (fileB) {
      const bufferB = Buffer.from(await fileB.arrayBuffer())
      const parseB = await ReconciliationFileParserService.parseFile(
        bufferB, fileB.name,
        sourceBConfig.columns?.length > 0 ? sourceBConfig : undefined,
        "full", sourceBConfig.extractionProfile
      )
      sourceBRows = parseB.rows

      // Store file
      const storage = getStorageService()
      const keyB = `reconciliations/${configId}/${run.id}/B-${Date.now()}-${fileB.name}`
      await storage.upload(bufferB, keyB, fileB.type)

      await ReconciliationService.updateRunSource(run.id, session.user.organizationId, "B", {
        fileKey: keyB, fileName: fileB.name, rows: parseB.rows, totalRows: parseB.rowCount,
      })
    }

    // Run matching
    const matchingRules = config.matchingRules as any
    const matchingGuidelines = config.matchingGuidelines as any
    const learnedContext = config.learnedContext as any

    // Reload rows from DB in case updateRunSource transformed them
    const updatedRun = await prisma.reconciliationRun.findUnique({ where: { id: run.id } })
    const finalRowsA = (updatedRun?.sourceARows as any) || sourceARows
    const finalRowsB = (updatedRun?.sourceBRows as any) || sourceBRows

    if (Array.isArray(finalRowsA) && finalRowsA.length > 0 && Array.isArray(finalRowsB) && finalRowsB.length > 0) {
      const matchResult = await ReconciliationMatchingService.runMatching({
        sourceARows: finalRowsA,
        sourceBRows: finalRowsB,
        sourceAConfig,
        sourceBConfig,
        matchingRules: matchingRules || { amountMatch: "exact", dateWindowDays: 0, fuzzyDescription: true },
        matchingGuidelines: matchingGuidelines?.guidelines || null,
        learnedPatterns: learnedContext?.patterns || [],
      })

      // Convert exceptions array to keyed object
      const exceptionsMap: Record<string, any> = {}
      for (const exc of matchResult.exceptions || []) {
        const key = `${exc.source}-${exc.rowIdx}`
        exceptionsMap[key] = exc
      }

      await ReconciliationService.saveMatchResults(run.id, session.user.organizationId, {
        matchResults: {
          matched: matchResult.matched,
          unmatchedA: matchResult.unmatchedA,
          unmatchedB: matchResult.unmatchedB,
        },
        exceptions: exceptionsMap,
        matchedCount: matchResult.matched.length,
        exceptionCount: Object.keys(exceptionsMap).length,
        variance: matchResult.variance,
      })
    } else {
      // No rows to match — mark as failed
      await prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "REVIEW",
          matchedCount: 0,
          exceptionCount: 0,
          variance: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      runId: run.id,
      status: "REVIEW",
    })
  } catch (error: any) {
    console.error("[Generate Test] Error:", error?.message || error)
    return NextResponse.json(
      { error: error?.message || "Failed to generate test reconciliation" },
      { status: 500 }
    )
  }
}
