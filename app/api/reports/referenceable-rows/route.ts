/**
 * Referenceable Rows API
 *
 * GET /api/reports/referenceable-rows?excludeId=xxx
 * Returns rows from other reports that can be referenced via REF() in accounting formulas.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { ReportDefinitionService } from "@/lib/services/report-definition.service"

interface ReferenceableRow {
  label: string
  type: "group" | "formula"
}

interface ReferenceableColumn {
  key: string
  label: string
  type: "pivot" | "formula"  // pivot = date/period column, formula = computed (SUM, etc.)
}

interface ReferenceableReport {
  id: string
  name: string
  layout: string
  rows: ReferenceableRow[]
  columns: ReferenceableColumn[]  // Available columns (periods + formula columns)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reports:view_all_definitions", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const excludeId = searchParams.get("excludeId")

    const allReports = await ReportDefinitionService.listReportDefinitions(session.user.organizationId)

    const result: ReferenceableReport[] = []

    for (const report of allReports as any[]) {
      if (report.id === excludeId) continue

      // Only accounting layout reports have group totals and formula rows that make sense to reference
      if (report.layout !== "accounting") continue

      const rows: ReferenceableRow[] = []

      // Extract group names: prefer explicit groupOrder, fall back to discovering from database rows
      let groupNames: string[] = (report.groupOrder || []) as string[]
      // Filter out formula entries in groupOrder (prefixed with "formula:")
      groupNames = groupNames.filter((g: string) => !g.startsWith("formula:"))

      if (groupNames.length === 0 && report.groupByColumnKey) {
        // Discover groups from database rows
        const db = await prisma.database.findFirst({
          where: { id: report.databaseId, organizationId: session.user.organizationId },
          select: { rows: true },
        })
        if (db?.rows) {
          const seen = new Set<string>()
          for (const row of db.rows as Array<Record<string, unknown>>) {
            const g = String(row[report.groupByColumnKey] ?? "")
            if (g && !seen.has(g)) { seen.add(g); groupNames.push(g) }
          }
        }
      }

      for (const groupName of groupNames) {
        rows.push({ label: `TOTAL ${groupName}`, type: "group" })
      }

      // Extract accounting formula row labels
      const accountingFormulaRows = (report.accountingFormulaRows || []) as Array<{ label: string; order: number }>
      const sorted = [...accountingFormulaRows].sort((a, b) => a.order - b.order)
      for (const fr of sorted) {
        rows.push({ label: fr.label, type: "formula" })
      }

      // Extract available columns: pivot formula columns (SUM, Total, etc.)
      const columns: ReferenceableColumn[] = []
      const pivotFormulaColumns = (report.pivotFormulaColumns || []) as Array<{ key: string; label: string; order: number }>
      const sortedCols = [...pivotFormulaColumns].sort((a, b) => a.order - b.order)
      for (const fc of sortedCols) {
        columns.push({ key: fc.key, label: fc.label, type: "formula" })
      }

      if (rows.length > 0) {
        result.push({
          id: report.id,
          name: report.name,
          layout: report.layout,
          rows,
          columns,
        })
      }
    }

    return NextResponse.json({ reports: result })
  } catch (error) {
    console.error("Error fetching referenceable rows:", error)
    return NextResponse.json({ error: "Failed to fetch referenceable rows" }, { status: 500 })
  }
}
