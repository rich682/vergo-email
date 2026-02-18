/**
 * Database → Parquet Pipeline
 *
 * Converts Database JSON rows to Parquet for DuckDB analytical queries.
 * Uses the same DuckDB pipeline as the original upload-pipeline.ts.
 *
 * Parquet lifecycle:
 *  - Built on-demand when a database is first selected for analysis chat
 *  - Marked "stale" when database rows change (import, delete, sync)
 *  - Rebuilt transparently via ensureFreshParquet()
 */

import * as fs from "fs"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { createLocalDuckDB, sanitizeTableName, execAsync, allAsync } from "./duckdb-manager"
import type { DuckDBHandle } from "./duckdb-manager"
import type { DatabaseSchema, DatabaseRow } from "@/lib/services/database.service"

export interface ParquetInfo {
  parquetBlobUrl: string
  analysisTableName: string
  analysisSchemaSnapshot: { columns: Array<{ name: string; duckdbType: string; sampleValues: string[] }> }
  analysisSummaryStats: Record<string, unknown>
  name: string
}

/**
 * Build a Parquet file from a Database's JSON rows.
 *
 * Steps: read rows → write temp CSV → DuckDB ingest → export Parquet → upload to Blob → generate stats
 */
export async function buildDatabaseParquet(
  databaseId: string,
  organizationId: string
): Promise<{ success: boolean; rowCount?: number; error?: string }> {
  // Mark as building
  await prisma.database.update({
    where: { id: databaseId },
    data: { parquetStatus: "building", parquetError: null },
  })

  let handle: DuckDBHandle | null = null
  const tmpFiles: string[] = []

  try {
    const database = await prisma.database.findFirst({
      where: { id: databaseId, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const schema = database.schema as unknown as DatabaseSchema
    const rows = database.rows as unknown as DatabaseRow[]

    if (rows.length === 0) {
      // No rows — still create a valid Parquet with schema but no data
      // Mark as ready with 0 rows
      const tableName = sanitizeTableName(
        database.name.toLowerCase().replace(/\s+/g, "_") + "_" + databaseId.slice(-6)
      )
      await prisma.database.update({
        where: { id: databaseId },
        data: {
          parquetStatus: "ready",
          parquetRowCount: 0,
          parquetGeneratedAt: new Date(),
          analysisTableName: tableName,
          analysisSchemaSnapshot: {
            columns: schema.columns.map((c) => ({
              name: c.label,
              duckdbType: mapDataTypeToDuckDB(c.dataType),
              sampleValues: [],
            })),
          },
          analysisSummaryStats: { rowCount: 0, columns: {} },
        },
      })
      return { success: true, rowCount: 0 }
    }

    // Sort columns by order
    const columns = [...schema.columns].sort((a, b) => a.order - b.order)

    // Write rows to temp CSV
    const csvPath = `/tmp/db_parquet_${databaseId}.csv`
    tmpFiles.push(csvPath)

    const headers = columns.map((c) => escapeCSVField(c.label)).join(",")
    const csvRows = rows.map((row) =>
      columns.map((c) => escapeCSVField(String(row[c.key] ?? ""))).join(",")
    )
    fs.writeFileSync(csvPath, [headers, ...csvRows].join("\n"))

    // Create DuckDB, ingest CSV
    const tableName = sanitizeTableName(
      database.name.toLowerCase().replace(/\s+/g, "_") + "_" + databaseId.slice(-6)
    )

    handle = await createLocalDuckDB()
    const { connection } = handle

    const escapedPath = csvPath.replace(/'/g, "''")
    await execAsync(
      connection,
      `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${escapedPath}', header=true, sample_size=10000);`
    )

    // Export to Parquet
    const parquetPath = `/tmp/db_parquet_${databaseId}.parquet`
    tmpFiles.push(parquetPath)
    await execAsync(
      connection,
      `COPY "${tableName}" TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD);`
    )

    // Upload to Vercel Blob
    const blobKey = `databases/${organizationId}/${databaseId}.parquet`
    const parquetBuffer = fs.readFileSync(parquetPath)
    const { url: parquetUrl } = await put(blobKey, parquetBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // Get schema from DuckDB (actual inferred types)
    const schemaRows = await allAsync(connection, `DESCRIBE SELECT * FROM "${tableName}"`)
    const duckdbColumns = schemaRows.map((row: any) => ({
      name: String(row.column_name),
      duckdbType: String(row.column_type),
      sampleValues: [] as string[],
    }))

    // Get row count
    const countResult = await allAsync(connection, `SELECT COUNT(*) as cnt FROM "${tableName}"`)
    const rowCount = Number(countResult[0].cnt)

    // Generate summary stats (same pattern as upload-pipeline.ts)
    const summaryStats: Record<string, any> = { rowCount, columns: {} }
    for (const col of duckdbColumns) {
      const colName = col.name.replace(/"/g, '""')
      try {
        const isNumeric = [
          "BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL",
          "HUGEINT", "SMALLINT", "TINYINT", "UBIGINT", "UINTEGER",
          "USMALLINT", "UTINYINT",
        ].some((t) => col.duckdbType.toUpperCase().includes(t))

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
          const sampleValues = sampleResult
            .map((r: any) => String(r[col.name]))
            .slice(0, 5)
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

    // Update database record with Parquet info
    await prisma.database.update({
      where: { id: databaseId },
      data: {
        parquetBlobKey: blobKey,
        parquetBlobUrl: parquetUrl,
        parquetRowCount: rowCount,
        parquetGeneratedAt: new Date(),
        parquetStatus: "ready",
        parquetError: null,
        analysisSchemaSnapshot: { columns: duckdbColumns },
        analysisSummaryStats: summaryStats,
        analysisTableName: tableName,
      },
    })

    return { success: true, rowCount }
  } catch (error: any) {
    console.error(`[Database Parquet] Failed for database ${databaseId}:`, error)
    await prisma.database.update({
      where: { id: databaseId },
      data: {
        parquetStatus: "error",
        parquetError: error.message?.slice(0, 500),
      },
    })
    return { success: false, error: error.message }
  } finally {
    handle?.cleanup()
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
  }
}

/**
 * Ensure a database has a fresh Parquet file ready for analysis.
 * Returns Parquet info if ready, builds if stale/missing.
 */
export async function ensureFreshParquet(
  databaseId: string,
  organizationId: string
): Promise<ParquetInfo> {
  const database = await prisma.database.findFirst({
    where: { id: databaseId, organizationId },
    select: {
      id: true,
      name: true,
      parquetStatus: true,
      parquetBlobUrl: true,
      analysisTableName: true,
      analysisSchemaSnapshot: true,
      analysisSummaryStats: true,
      rowCount: true,
    },
  })

  if (!database) {
    throw new Error("Database not found")
  }

  // If Parquet is ready, return cached info
  if (
    database.parquetStatus === "ready" &&
    database.parquetBlobUrl &&
    database.analysisTableName &&
    database.analysisSchemaSnapshot
  ) {
    return {
      parquetBlobUrl: database.parquetBlobUrl,
      analysisTableName: database.analysisTableName,
      analysisSchemaSnapshot: database.analysisSchemaSnapshot as any,
      analysisSummaryStats: (database.analysisSummaryStats as any) || { rowCount: 0, columns: {} },
      name: database.name,
    }
  }

  // Build or rebuild Parquet
  const result = await buildDatabaseParquet(databaseId, organizationId)

  if (!result.success) {
    throw new Error(`Failed to prepare database for analysis: ${result.error}`)
  }

  // Re-fetch the updated record
  const updated = await prisma.database.findFirst({
    where: { id: databaseId, organizationId },
    select: {
      name: true,
      parquetBlobUrl: true,
      analysisTableName: true,
      analysisSchemaSnapshot: true,
      analysisSummaryStats: true,
    },
  })

  if (!updated?.parquetBlobUrl || !updated.analysisTableName) {
    throw new Error("Parquet build succeeded but data is missing")
  }

  return {
    parquetBlobUrl: updated.parquetBlobUrl,
    analysisTableName: updated.analysisTableName,
    analysisSchemaSnapshot: updated.analysisSchemaSnapshot as any,
    analysisSummaryStats: (updated.analysisSummaryStats as any) || { rowCount: 0, columns: {} },
    name: updated.name,
  }
}

/**
 * Mark a database's Parquet as stale (needs rebuild on next analysis query).
 * This is a fire-and-forget operation — failure is non-fatal.
 */
export async function invalidateParquet(databaseId: string): Promise<void> {
  try {
    await prisma.database.update({
      where: { id: databaseId },
      data: { parquetStatus: "stale" },
    })
  } catch {
    // Non-fatal: the only consequence is stale analysis data
    console.warn(`[Database Parquet] Failed to invalidate parquet for database ${databaseId}`)
  }
}

// --- Helpers ---

function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function mapDataTypeToDuckDB(dataType: string): string {
  switch (dataType) {
    case "number":
    case "currency":
      return "DOUBLE"
    case "date":
      return "DATE"
    case "boolean":
      return "BOOLEAN"
    default:
      return "VARCHAR"
  }
}
