/**
 * Analysis Dataset Preview API
 *
 * GET — Preview first 100 rows of a dataset via DuckDB
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { createOrgDuckDB, executeQuery } from "@/lib/analysis/duckdb-manager"

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const dataset = await prisma.analysisDataset.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
      status: "ready",
    },
  })

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found or not ready" }, { status: 404 })
  }

  if (!dataset.parquetBlobUrl) {
    return NextResponse.json({ error: "Dataset file not available" }, { status: 404 })
  }

  const handle = await createOrgDuckDB([{
    tableName: dataset.tableName,
    parquetUrl: dataset.parquetBlobUrl,
  }])

  try {
    const result = await executeQuery(
      handle.connection,
      `SELECT * FROM "${dataset.tableName}"`,
      { maxRows: 100, timeoutMs: 15_000 }
    )

    return NextResponse.json({
      rows: result.rows,
      totalRows: dataset.rowCount,
      previewRows: result.rows.length,
      schema: dataset.schemaSnapshot,
    })
  } finally {
    handle.cleanup()
  }
}
