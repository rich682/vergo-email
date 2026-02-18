/**
 * Analysis Upload Pipeline
 *
 * Processes uploaded CSV/Excel files:
 * 1. Parse file → DuckDB temp table
 * 2. Export to Parquet (compressed)
 * 3. Upload Parquet to Vercel Blob
 * 4. Generate schema snapshot + summary stats
 * 5. Update Postgres metadata
 */

import * as fs from "fs"
import * as path from "path"
import * as XLSX from "xlsx"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { createLocalDuckDB, sanitizeTableName, execAsync, allAsync } from "./duckdb-manager"

export interface UploadPipelineInput {
  fileBuffer: Buffer
  fileName: string
  fileSize: number
  organizationId: string
  uploadedById: string
  datasetName: string
  description?: string
}

export interface UploadPipelineResult {
  datasetId: string
  status: "ready" | "failed"
  rowCount?: number
  columnCount?: number
  errorMessage?: string
}

function generateId(): string {
  // Use cuid-compatible random ID
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Process a dataset upload: parse → Parquet → Blob → stats → Postgres.
 */
export async function processDatasetUpload(input: UploadPipelineInput): Promise<UploadPipelineResult> {
  const datasetId = generateId()
  const tableName = sanitizeTableName(
    input.datasetName.toLowerCase().replace(/\s+/g, "_") + "_" + datasetId.slice(-6)
  )
  const blobKey = `analysis/${input.organizationId}/${datasetId}.parquet`

  // Create dataset record in "processing" state
  await prisma.analysisDataset.create({
    data: {
      id: datasetId,
      organizationId: input.organizationId,
      name: input.datasetName,
      description: input.description,
      tableName,
      originalFilename: input.fileName,
      fileSizeBytes: input.fileSize,
      parquetBlobKey: blobKey,
      schemaSnapshot: { columns: [] },
      status: "processing",
      uploadedById: input.uploadedById,
    },
  })

  let handle: { db: any; connection: any; cleanup: () => void } | null = null
  const tmpFiles: string[] = []

  try {
    // 1. Write uploaded file to /tmp
    const extension = path.extname(input.fileName).toLowerCase()
    const tmpInputPath = `/tmp/analysis_${datasetId}${extension}`
    fs.writeFileSync(tmpInputPath, input.fileBuffer)
    tmpFiles.push(tmpInputPath)

    // 2. Prepare CSV for DuckDB ingestion
    let csvPath = tmpInputPath
    if (extension !== ".csv") {
      // Convert Excel to CSV using xlsx library
      const workbook = XLSX.readFile(tmpInputPath, { cellDates: true })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const csvContent = XLSX.utils.sheet_to_csv(firstSheet)
      csvPath = `/tmp/analysis_${datasetId}.csv`
      fs.writeFileSync(csvPath, csvContent)
      tmpFiles.push(csvPath)
    }

    // 3. Create DuckDB, ingest file
    handle = await createLocalDuckDB()
    const { connection } = handle

    const escapedPath = csvPath.replace(/'/g, "''")
    await execAsync(
      connection,
      `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${escapedPath}', header=true, sample_size=10000);`
    )

    // 4. Export to Parquet
    const parquetPath = `/tmp/analysis_${datasetId}.parquet`
    tmpFiles.push(parquetPath)
    await execAsync(
      connection,
      `COPY "${tableName}" TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD);`
    )

    // 5. Upload Parquet to Vercel Blob
    const parquetBuffer = fs.readFileSync(parquetPath)
    const { url: parquetUrl } = await put(blobKey, parquetBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // 6. Get schema
    const schemaRows = await allAsync(connection, `DESCRIBE SELECT * FROM "${tableName}"`)
    const columns = schemaRows.map((row: any) => ({
      name: String(row.column_name),
      duckdbType: String(row.column_type),
      sampleValues: [] as string[],
    }))

    // 7. Get row count
    const countResult = await allAsync(connection, `SELECT COUNT(*) as cnt FROM "${tableName}"`)
    const rowCount = Number(countResult[0].cnt)

    // 8. Generate summary stats
    const summaryStats: Record<string, any> = { rowCount, columns: {} }
    for (const col of columns) {
      const colName = col.name.replace(/"/g, '""')
      try {
        const isNumeric = ["BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "SMALLINT", "TINYINT", "UBIGINT", "UINTEGER", "USMALLINT", "UTINYINT"]
          .some(t => col.duckdbType.toUpperCase().includes(t))

        if (isNumeric) {
          const stats = await allAsync(
            connection,
            `SELECT MIN("${colName}") as min_val, MAX("${colName}") as max_val, AVG("${colName}")::DOUBLE as avg_val, COUNT(*) - COUNT("${colName}") as null_count FROM "${tableName}"`
          )
          summaryStats.columns[col.name] = {
            type: "numeric",
            min: stats[0].min_val,
            max: stats[0].max_val,
            mean: stats[0].avg_val,
            nullCount: Number(stats[0].null_count),
          }
        } else {
          const stats = await allAsync(
            connection,
            `SELECT COUNT(DISTINCT "${colName}") as distinct_count, COUNT(*) - COUNT("${colName}") as null_count FROM "${tableName}"`
          )
          const sampleResult = await allAsync(
            connection,
            `SELECT DISTINCT "${colName}" FROM "${tableName}" WHERE "${colName}" IS NOT NULL LIMIT 10`
          )
          const sampleValues = sampleResult.map((r: any) => String(r[col.name])).slice(0, 5)
          summaryStats.columns[col.name] = {
            type: "text",
            distinctCount: Number(stats[0].distinct_count),
            nullCount: Number(stats[0].null_count),
            sampleValues,
          }
          col.sampleValues = sampleValues
        }
      } catch {
        // Skip columns that error during stats generation
      }
    }

    // 9. Update Postgres record
    await prisma.analysisDataset.update({
      where: { id: datasetId },
      data: {
        status: "ready",
        parquetBlobUrl: parquetUrl,
        schemaSnapshot: { columns },
        summaryStats,
        rowCount,
        columnCount: columns.length,
      },
    })

    return { datasetId, status: "ready", rowCount, columnCount: columns.length }
  } catch (error: any) {
    console.error(`[Analysis Upload] Failed for dataset ${datasetId}:`, error)
    await prisma.analysisDataset.update({
      where: { id: datasetId },
      data: { status: "failed", errorMessage: error.message?.slice(0, 500) },
    })
    return { datasetId, status: "failed", errorMessage: error.message }
  } finally {
    // Cleanup
    handle?.cleanup()
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}
