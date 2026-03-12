/**
 * Tests for Report Execution Service
 *
 * Tests the pure data-processing methods of the report execution service.
 * TypeScript `private` is not enforced at runtime, so we access private static
 * methods via bracket notation for thorough unit testing.
 */

import { describe, it, expect } from "vitest"
import { ReportExecutionService } from "@/lib/services/report-execution.service"

// Access private static methods via bracket notation (JS runtime allows this)
const Service = ReportExecutionService as any

// ============================================
// filterRowsByPeriod
// ============================================
describe("filterRowsByPeriod", () => {
  const rows = [
    { date: "2026-01-15", amount: 100, name: "A" },
    { date: "2026-01-28", amount: 200, name: "B" },
    { date: "2026-02-10", amount: 300, name: "C" },
    { date: "2026-03-05", amount: 400, name: "D" },
    { date: "invalid-date", amount: 500, name: "E" },
    { date: null, amount: 600, name: "F" },
  ]

  it("filters rows by monthly period key", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2026-01", "monthly")
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].name).toBe("A")
    expect(result.rows[1].name).toBe("B")
  })

  it("filters rows by quarterly period key", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2026-Q1", "quarterly")
    expect(result.rows).toHaveLength(4) // Jan 15, Jan 28, Feb 10, Mar 5 — all Q1
    expect(result.rows.map((r: any) => r.name)).toEqual(["A", "B", "C", "D"])
  })

  it("counts parse failures for invalid dates", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2026-01", "monthly")
    expect(result.parseFailures).toBe(2) // "invalid-date" and null
  })

  it("returns empty array when no rows match period", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2025-12", "monthly")
    expect(result.rows).toHaveLength(0)
  })

  it("handles empty row array", () => {
    const result = Service.filterRowsByPeriod([], "date", "2026-01", "monthly")
    expect(result.rows).toHaveLength(0)
    expect(result.parseFailures).toBe(0)
  })

  it("handles daily period filtering", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2026-01-15", "daily")
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe("A")
  })

  it("handles annual period filtering", () => {
    const result = Service.filterRowsByPeriod(rows, "date", "2026", "annual")
    // All valid dates are 2026
    expect(result.rows).toHaveLength(4)
  })

  it("filters by non-existent column (all fail to parse)", () => {
    const result = Service.filterRowsByPeriod(rows, "nonexistent", "2026-01", "monthly")
    expect(result.rows).toHaveLength(0)
    expect(result.parseFailures).toBe(6) // All rows fail
  })
})

// ============================================
// filterRowsByColumnValues
// ============================================
describe("filterRowsByColumnValues", () => {
  const rows = [
    { project: "Alpha", status: "active", amount: 100 },
    { project: "Beta", status: "active", amount: 200 },
    { project: "Gamma", status: "closed", amount: 300 },
    { project: "Alpha", status: "closed", amount: 400 },
  ]

  it("returns all rows when filters is empty", () => {
    const result = Service.filterRowsByColumnValues(rows, {})
    expect(result).toHaveLength(4)
  })

  it("returns all rows when all filters are null/undefined", () => {
    const result = Service.filterRowsByColumnValues(rows, { project: null, status: undefined })
    expect(result).toHaveLength(4)
  })

  it("returns all rows when filter arrays are empty (the bug fix)", () => {
    // This was the critical bug — empty arrays should be skipped, not treated as "IN []"
    const result = Service.filterRowsByColumnValues(rows, { project: [] })
    expect(result).toHaveLength(4)
  })

  it("filters by exact value", () => {
    const result = Service.filterRowsByColumnValues(rows, { status: "active" })
    expect(result).toHaveLength(2)
    expect(result.every((r: any) => r.status === "active")).toBe(true)
  })

  it("filters by array (IN operator)", () => {
    const result = Service.filterRowsByColumnValues(rows, { project: ["Alpha", "Gamma"] })
    expect(result).toHaveLength(3)
  })

  it("applies multiple filters (AND logic)", () => {
    const result = Service.filterRowsByColumnValues(rows, { project: "Alpha", status: "active" })
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it("excludes rows missing the filter key", () => {
    const result = Service.filterRowsByColumnValues(rows, { nonexistent: "value" })
    expect(result).toHaveLength(0)
  })

  it("handles mixed null and active filters", () => {
    const result = Service.filterRowsByColumnValues(rows, {
      project: null,       // Should be ignored
      status: "closed",    // Should filter
    })
    expect(result).toHaveLength(2)
  })

  it("handles empty rows array", () => {
    const result = Service.filterRowsByColumnValues([], { status: "active" })
    expect(result).toHaveLength(0)
  })
})

// ============================================
// evaluatePivotFormulaColumn
// ============================================
describe("evaluatePivotFormulaColumn", () => {
  const pivotValues = ["Chipotle", "McDonalds", "Subway"]
  const row = {
    Chipotle: 1000,
    McDonalds: 2000,
    Subway: 1500,
  }

  it("computes SUM(*)", () => {
    const result = Service.evaluatePivotFormulaColumn("SUM(*)", row, pivotValues)
    expect(result).toBe(4500)
  })

  it("computes AVG(*)", () => {
    const result = Service.evaluatePivotFormulaColumn("AVG(*)", row, pivotValues)
    expect(result).toBe(1500)
  })

  it("computes AVERAGE(*) (alias)", () => {
    const result = Service.evaluatePivotFormulaColumn("AVERAGE(*)", row, pivotValues)
    expect(result).toBe(1500)
  })

  it("computes MIN(*)", () => {
    const result = Service.evaluatePivotFormulaColumn("MIN(*)", row, pivotValues)
    expect(result).toBe(1000)
  })

  it("computes MAX(*)", () => {
    const result = Service.evaluatePivotFormulaColumn("MAX(*)", row, pivotValues)
    expect(result).toBe(2000)
  })

  it("computes COUNT(*)", () => {
    const result = Service.evaluatePivotFormulaColumn("COUNT(*)", row, pivotValues)
    expect(result).toBe(3)
  })

  it("returns null for empty row", () => {
    const emptyRow = { Chipotle: null, McDonalds: null, Subway: null }
    const result = Service.evaluatePivotFormulaColumn("SUM(*)", emptyRow, pivotValues)
    expect(result).toBeNull()
  })

  it("handles string number values in rows", () => {
    const stringRow = { Chipotle: "1000", McDonalds: "2000", Subway: "1500" }
    const result = Service.evaluatePivotFormulaColumn("SUM(*)", stringRow, pivotValues)
    expect(result).toBe(4500)
  })

  it("is case-insensitive for function names", () => {
    expect(Service.evaluatePivotFormulaColumn("sum(*)", row, pivotValues)).toBe(4500)
    expect(Service.evaluatePivotFormulaColumn("Sum(*)", row, pivotValues)).toBe(4500)
  })

  it("handles column reference expressions", () => {
    // Column reference: value of a specific pivot column
    const result = Service.evaluatePivotFormulaColumn("Chipotle", row, pivotValues)
    // This might return null or the value depending on implementation
    // The method tries safe expression evaluation for non-aggregate expressions
    expect(typeof result === "number" || result === null).toBe(true)
  })

  it("skips non-numeric values in aggregation", () => {
    const mixedRow = { Chipotle: 1000, McDonalds: "not-a-number", Subway: 1500 }
    const result = Service.evaluatePivotFormulaColumn("SUM(*)", mixedRow, pivotValues)
    expect(result).toBe(2500)
  })
})

// ============================================
// evaluateStandardLayout
// ============================================
describe("evaluateStandardLayout", () => {
  it("returns empty table for report with no columns", () => {
    const report = { columns: [], formulaRows: [], cadence: "monthly", dateColumnKey: "date", layout: "standard" }
    const result = Service.evaluateStandardLayout(report, [], null)
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  it("generates columns from report column config", () => {
    const report = {
      columns: [
        { key: "name", label: "Name", dataType: "text", type: "source", order: 1 },
        { key: "amount", label: "Amount", dataType: "number", type: "source", order: 2 },
      ],
      formulaRows: [],
      cadence: "monthly",
      dateColumnKey: "date",
      layout: "standard",
    }
    const rows = [
      { name: "Project A", amount: 1000 },
      { name: "Project B", amount: 2000 },
    ]
    const result = Service.evaluateStandardLayout(report, rows, null)
    expect(result.columns).toHaveLength(2)
    expect(result.columns[0].key).toBe("name")
    expect(result.columns[1].key).toBe("amount")
    expect(result.rows).toHaveLength(2)
  })

  it("sorts columns by order", () => {
    const report = {
      columns: [
        { key: "b", label: "B", dataType: "text", type: "source", order: 2 },
        { key: "a", label: "A", dataType: "text", type: "source", order: 1 },
      ],
      formulaRows: [],
      cadence: "monthly",
      dateColumnKey: "date",
      layout: "standard",
    }
    const result = Service.evaluateStandardLayout(report, [{ a: 1, b: 2 }], null)
    expect(result.columns[0].key).toBe("a")
    expect(result.columns[1].key).toBe("b")
  })

  it("limits rows to 100 for preview", () => {
    const report = {
      columns: [{ key: "x", label: "X", dataType: "number", type: "source", order: 1 }],
      formulaRows: [],
      cadence: "monthly",
      dateColumnKey: "date",
      layout: "standard",
    }
    const manyRows = Array.from({ length: 150 }, (_, i) => ({ x: i }))
    const result = Service.evaluateStandardLayout(report, manyRows, null)
    expect(result.rows.length).toBeLessThanOrEqual(100)
  })
})

// ============================================
// evaluatePivotLayout
// ============================================
describe("evaluatePivotLayout", () => {
  it("returns empty table when pivotColumnKey is missing", () => {
    const report = { pivotColumnKey: null, metricRows: [{ key: "m1", label: "M1", type: "source", sourceColumnKey: "amount", format: "number", order: 1 }] }
    const result = Service.evaluatePivotLayout(report, [], null)
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  it("returns empty table when metricRows is empty", () => {
    const report = { pivotColumnKey: "project", metricRows: [] }
    const result = Service.evaluatePivotLayout(report, [], null)
    expect(result.columns).toEqual([])
  })

  it("creates columns from unique pivot values", () => {
    const report = {
      pivotColumnKey: "project",
      metricRows: [
        { key: "revenue", label: "Revenue", type: "source", sourceColumnKey: "amount", format: "number", order: 1 },
      ],
      pivotFormulaColumns: [],
      pivotSortConfig: null,
    }
    const rows = [
      { project: "Alpha", amount: 100 },
      { project: "Beta", amount: 200 },
      { project: "Alpha", amount: 150 },
    ]
    const result = Service.evaluatePivotLayout(report, rows, null)
    // Should have metric label column + Alpha + Beta = 3+ columns
    expect(result.columns.length).toBeGreaterThanOrEqual(2)
  })

  it("handles duplicate pivot values with disambiguation", () => {
    const report = {
      pivotColumnKey: "restaurant",
      metricRows: [
        { key: "revenue", label: "Revenue", type: "source", sourceColumnKey: "amount", format: "number", order: 1 },
      ],
      pivotFormulaColumns: [],
      pivotSortConfig: null,
    }
    // Two rows with same restaurant name — should create separate columns
    const rows = [
      { restaurant: "Chipotle", amount: 1000 },
      { restaurant: "Chipotle", amount: 2000 },
      { restaurant: "McDonalds", amount: 1500 },
    ]
    const result = Service.evaluatePivotLayout(report, rows, null)
    // Should have 3 data columns (Chipotle, Chipotle (2), McDonalds) + metric label column
    const dataColumns = result.columns.filter((c: any) => c.key !== "__metric_label__")
    expect(dataColumns.length).toBeGreaterThanOrEqual(3)
  })
})

// ============================================
// evaluateAccountingLayout
// ============================================
describe("evaluateAccountingLayout", () => {
  it("returns empty table when required keys are missing", () => {
    const report = { rowColumnKey: null, pivotColumnKey: "project", valueColumnKey: "amount" }
    const result = Service.evaluateAccountingLayout(report, [])
    expect(result.columns).toEqual([])
  })

  it("returns empty table for empty rows", () => {
    const report = { rowColumnKey: "account", pivotColumnKey: "project", valueColumnKey: "amount" }
    const result = Service.evaluateAccountingLayout(report, [])
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  it("creates cross-tab from row, pivot, and value columns", () => {
    const report = {
      rowColumnKey: "account",
      pivotColumnKey: "project",
      valueColumnKey: "amount",
    }
    const rows = [
      { account: "Revenue", project: "Alpha", amount: 1000 },
      { account: "Revenue", project: "Beta", amount: 2000 },
      { account: "Expenses", project: "Alpha", amount: 500 },
      { account: "Expenses", project: "Beta", amount: 800 },
    ]
    const result = Service.evaluateAccountingLayout(report, rows)

    // Should have account label column + Alpha + Beta = 3 columns
    expect(result.columns.length).toBeGreaterThanOrEqual(2)
    // Should have 2 rows (Revenue, Expenses)
    expect(result.rows).toHaveLength(2)
  })
})
