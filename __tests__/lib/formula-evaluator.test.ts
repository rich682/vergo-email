import { describe, it, expect } from "vitest"
import { buildFormulaContext, evaluateColumnFormula, evaluateRowFormula } from "@/lib/formula"
import type { FormulaDefinition } from "@/lib/formula"

describe("formula evaluator", () => {
  const columns = [
    { key: "item", label: "Item", dataType: "text" },
    { key: "jan", label: "Jan", dataType: "currency" },
    { key: "feb", label: "Feb", dataType: "currency" },
  ]

  const rows = [
    { item: "Fixed Costs", jan: 100, feb: 200 },
    { item: "Variable Costs", jan: 50, feb: 75 },
  ]

  const context = buildFormulaContext(
    "current",
    [{ id: "current", label: "Current", rows }],
    columns,
    "item"
  )

  it("evaluates row formula SUM({column}) across rows", () => {
    const formula: FormulaDefinition = {
      expression: "SUM({column})",
      references: [],
      resultType: "number",
    }

    const result = evaluateRowFormula(formula, context, {
      columnKey: "jan",
      columnLabel: "Jan",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(150)
    }
  })

  it("evaluates row formula with row references by identity label", () => {
    const formula: FormulaDefinition = {
      expression: "{Fixed Costs} + {Variable Costs}",
      references: [],
      resultType: "number",
    }

    const result = evaluateRowFormula(formula, context, {
      columnKey: "feb",
      columnLabel: "Feb",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(275)
    }
  })

  it("evaluates column formula SUM({column}) across row values", () => {
    const formula: FormulaDefinition = {
      expression: "SUM({column})",
      references: [],
      resultType: "number",
    }

    const result = evaluateColumnFormula(formula, context, {
      rowIndex: 0,
      row: rows[0],
      identity: String(rows[0].item),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(300)
    }
  })
})
