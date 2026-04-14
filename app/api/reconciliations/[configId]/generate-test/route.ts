/**
 * POST /api/reconciliations/[configId]/generate-test
 * Creates a run, parses source files, and triggers matching — all server-side.
 * Returns a streaming response with step-by-step progress logs.
 *
 * Accepts multipart form with:
 * - sourceA, sourceB: File uploads
 * - preParsedRowsA, preParsedRowsB: JSON string of pre-parsed rows (from analyze step)
 *   If pre-parsed rows are provided AND match expected row count, skip re-parsing.
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

  // Auth checks before streaming
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 })
  }

  const config = await ReconciliationService.getConfig(configId, session.user.organizationId)
  if (!config) {
    return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
  }

  const formData = await request.formData()
  const fileA = formData.get("sourceA") as File | null
  const fileB = formData.get("sourceB") as File | null
  const preParsedA = formData.get("preParsedRowsA") as string | null
  const preParsedB = formData.get("preParsedRowsB") as string | null

  const sourceAConfig = config.sourceAConfig as unknown as SourceConfig
  const sourceBConfig = config.sourceBConfig as unknown as SourceConfig

  if (sourceAConfig.sourceType !== "database" && !fileA) {
    return NextResponse.json({ error: "Source A file is required" }, { status: 400 })
  }
  if (sourceBConfig.sourceType !== "database" && !fileB) {
    return NextResponse.json({ error: "Source B file is required" }, { status: 400 })
  }

  // Stream progress back to client
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const log = (step: string, status: "progress" | "done" | "error", detail?: string) => {
        const msg = JSON.stringify({ step, status, detail, ts: Date.now() }) + "\n"
        controller.enqueue(encoder.encode(msg))
      }

      try {
        // Step 1: Create run
        log("Creating run", "progress")
        const run = await ReconciliationService.createRun({
          configId,
          organizationId: session.user.organizationId!,
        })
        await prisma.reconciliationRun.update({
          where: { id: run.id },
          data: { status: "PROCESSING" },
        })
        log("Creating run", "done", `Run ${run.id}`)

        // Step 2: Process Source A
        if (fileA) {
          const bufferA = Buffer.from(await fileA.arrayBuffer())

          // Check if we have pre-parsed rows from the analyze step (Excel/CSV)
          let rowsA: Record<string, any>[]
          if (preParsedA) {
            log("Loading Source A", "progress", `${fileA.name} (pre-parsed)`)
            rowsA = JSON.parse(preParsedA)
            log("Loading Source A", "done", `${rowsA.length} rows from cache`)
          } else {
            log("Parsing Source A", "progress", fileA.name)
            const parseA = await ReconciliationFileParserService.parseFile(
              bufferA, fileA.name,
              sourceAConfig.columns?.length > 0 ? sourceAConfig : undefined,
              "full", sourceAConfig.extractionProfile
            )
            rowsA = parseA.rows
            log("Parsing Source A", "done", `${parseA.rowCount} rows, ${parseA.detectedColumns.length} columns`)
          }

          log("Storing Source A", "progress")
          const storage = getStorageService()
          const keyA = `reconciliations/${configId}/${run.id}/A-${Date.now()}-${fileA.name}`
          await storage.upload(bufferA, keyA, fileA.type)
          await ReconciliationService.updateRunSource(run.id, session.user.organizationId!, "A", {
            fileKey: keyA, fileName: fileA.name, rows: rowsA, totalRows: rowsA.length,
          })
          log("Storing Source A", "done")
        }

        // Step 3: Process Source B
        if (fileB) {
          const bufferB = Buffer.from(await fileB.arrayBuffer())

          let rowsB: Record<string, any>[]
          if (preParsedB) {
            log("Loading Source B", "progress", `${fileB.name} (pre-parsed)`)
            rowsB = JSON.parse(preParsedB)
            log("Loading Source B", "done", `${rowsB.length} rows from cache`)
          } else {
            // Use the standard parser for all file types (handles Excel, CSV, PDF)
            // Do NOT pass sourceConfig for column remapping — let it use the file's native column names
            // The matching engine maps via config column keys which align with the file's column names
            log("Parsing Source B", "progress", fileB.name)
            const startTime = Date.now()
            const parseB = await ReconciliationFileParserService.parseFile(
              bufferB, fileB.name,
              undefined, // Don't remap columns — keep native keys
              "full",
              sourceBConfig.extractionProfile
            )
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            rowsB = parseB.rows
            log("Parsing Source B", "done", `${parseB.rowCount} rows, ${parseB.detectedColumns.length} columns in ${elapsed}s`)
            if (parseB.warnings.length > 0) {
              log("Source B warnings", "done", parseB.warnings.join("; "))
            }
            if (parseB.rowCount === 0) {
              log("Source B empty", "error", "No rows extracted — check PDF content")
            }
          }

          log("Storing Source B", "progress")
          const storage = getStorageService()
          const keyB = `reconciliations/${configId}/${run.id}/B-${Date.now()}-${fileB.name}`
          await storage.upload(bufferB, keyB, fileB.type)
          await ReconciliationService.updateRunSource(run.id, session.user.organizationId!, "B", {
            fileKey: keyB, fileName: fileB.name, rows: rowsB, totalRows: rowsB.length,
          })
          log("Storing Source B", "done")
        }

        // Step 4: Match
        const updatedRun = await prisma.reconciliationRun.findUnique({ where: { id: run.id } })
        const finalRowsA = (updatedRun?.sourceARows as any) || []
        const finalRowsB = (updatedRun?.sourceBRows as any) || []

        // Diagnostic: show data shapes, column keys, and sample values
        const configColsA = (sourceAConfig.columns || []).map((c: any) => `${c.key}(${c.type})`)
        const configColsB = (sourceBConfig.columns || []).map((c: any) => `${c.key}(${c.type})`)
        log("Data diagnostic", "done", `Config A cols: [${configColsA.join(", ")}]`)
        log("Data diagnostic", "done", `Config B cols: [${configColsB.join(", ")}]`)

        if (finalRowsA.length > 0) {
          const sampleA = finalRowsA[0]
          const keysA = Object.keys(sampleA).slice(0, 8)
          log("Source A sample", "done", `Keys: [${keysA.join(", ")}] | Row: ${JSON.stringify(sampleA).slice(0, 200)}`)
        }
        if (finalRowsB.length > 0) {
          const sampleB = finalRowsB[0]
          const keysB = Object.keys(sampleB).slice(0, 8)
          log("Source B sample", "done", `Keys: [${keysB.join(", ")}] | Row: ${JSON.stringify(sampleB).slice(0, 200)}`)
        }

        if (Array.isArray(finalRowsA) && finalRowsA.length > 0 && Array.isArray(finalRowsB) && finalRowsB.length > 0) {
          log("Running AI matching", "progress", `${finalRowsA.length} vs ${finalRowsB.length} rows`)

          const matchingRules = config.matchingRules as any
          const matchingGuidelines = config.matchingGuidelines as any
          const learnedContext = config.learnedContext as any

          const matchResult = await ReconciliationMatchingService.runMatching(
            finalRowsA,
            finalRowsB,
            sourceAConfig,
            sourceBConfig,
            matchingRules || { amountMatch: "tolerance", amountTolerance: 0.01, dateWindowDays: 3, fuzzyDescription: true },
            matchingGuidelines?.guidelines || undefined,
            learnedContext?.patterns || [],
          )

          const exceptionsMap: Record<string, any> = {}
          for (const exc of matchResult.exceptions || []) {
            exceptionsMap[`${exc.source}-${exc.rowIdx}`] = exc
          }

          await ReconciliationService.saveMatchResults(run.id, session.user.organizationId!, {
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

          log("Running AI matching", "done", `${matchResult.matched.length} matched, ${Object.keys(exceptionsMap).length} exceptions`)
        } else {
          await prisma.reconciliationRun.update({
            where: { id: run.id },
            data: { status: "REVIEW", matchedCount: 0, exceptionCount: 0, variance: 0 },
          })
          log("Running AI matching", "done", "No rows to match — check source parsing")
        }

        log("Complete", "done", run.id)
      } catch (err: any) {
        log("Error", "error", err?.message || "Unknown error")
        console.error("[Generate Test] Error:", err?.message || err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  })
}
