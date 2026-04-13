/**
 * Tests for Safe Expression Evaluator
 */

import { describe, it, expect } from "vitest"
import {
  evaluateSafeExpression,
  parseAggregateExpression,
  parseSimpleAggregateExpression,
  parseNumericValue,
  computeAggregate,
  extractColumnValues,
  extractReportRefs,
  hasReportRefs,
} from "@/lib/utils/safe-expression"

// ============================================
// evaluateSafeExpression
// ============================================
describe("evaluateSafeExpression", () => {
  describe("basic arithmetic", () => {
    it("evaluates addition", () => {
      expect(evaluateSafeExpression("1 + 2", {})).toBe(3)
    })

    it("evaluates subtraction", () => {
      expect(evaluateSafeExpression("10 - 3", {})).toBe(7)
    })

    it("evaluates multiplication", () => {
      expect(evaluateSafeExpression("4 * 5", {})).toBe(20)
    })

    it("evaluates division", () => {
      expect(evaluateSafeExpression("10 / 4", {})).toBe(2.5)
    })

    it("respects operator precedence (* before +)", () => {
      expect(evaluateSafeExpression("2 + 3 * 4", {})).toBe(14)
    })

    it("respects operator precedence (/ before -)", () => {
      expect(evaluateSafeExpression("10 - 6 / 2", {})).toBe(7)
    })

    it("handles parentheses for grouping", () => {
      expect(evaluateSafeExpression("(2 + 3) * 4", {})).toBe(20)
    })

    it("handles nested parentheses", () => {
      expect(evaluateSafeExpression("((2 + 3) * (4 - 1))", {})).toBe(15)
    })

    it("handles decimal numbers", () => {
      expect(evaluateSafeExpression("1.5 + 2.5", {})).toBe(4)
    })

    it("handles unary minus", () => {
      expect(evaluateSafeExpression("-5 + 10", {})).toBe(5)
    })

    it("handles unary plus", () => {
      expect(evaluateSafeExpression("+5 + 3", {})).toBe(8)
    })

    it("handles double negation", () => {
      expect(evaluateSafeExpression("--5", {})).toBe(5)
    })
  })

  describe("variable references", () => {
    it("resolves single variable", () => {
      expect(evaluateSafeExpression("revenue", { revenue: 1000 })).toBe(1000)
    })

    it("resolves multiple variables", () => {
      expect(evaluateSafeExpression("revenue - cost", { revenue: 1000, cost: 400 })).toBe(600)
    })

    it("uses variables in complex expressions", () => {
      expect(evaluateSafeExpression("revenue * 0.1 + cost", { revenue: 1000, cost: 50 })).toBe(150)
    })

    it("handles underscored variable names", () => {
      expect(evaluateSafeExpression("total_amount * tax_rate", { total_amount: 100, tax_rate: 0.08 })).toBe(8)
    })

    it("returns null for unknown variables", () => {
      expect(evaluateSafeExpression("unknown_var", {})).toBeNull()
    })
  })

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(evaluateSafeExpression("", {})).toBeNull()
    })

    it("returns null for whitespace only", () => {
      expect(evaluateSafeExpression("   ", {})).toBeNull()
    })

    it("returns null for division by zero", () => {
      expect(evaluateSafeExpression("10 / 0", {})).toBeNull()
    })

    it("handles trailing whitespace", () => {
      expect(evaluateSafeExpression("  5 + 3  ", {})).toBe(8)
    })

    it("rounds to 6 decimal places", () => {
      const result = evaluateSafeExpression("1 / 3", {})
      expect(result).toBe(0.333333)
    })

    it("returns null for invalid expressions", () => {
      expect(evaluateSafeExpression("5 +", {})).toBeNull()
      expect(evaluateSafeExpression("+ +", {})).toBeNull()
    })

    it("returns null for unexpected tokens after expression", () => {
      expect(evaluateSafeExpression("5 5", {})).toBeNull()
    })
  })

  describe("security", () => {
    it("rejects function calls", () => {
      // This should fail because ( after identifier looks like a function call
      // but the parser treats it as identifier followed by lparen which is unexpected
      expect(evaluateSafeExpression("alert(1)", { alert: 1 })).toBeNull()
    })

    it("rejects dot notation (object access)", () => {
      expect(evaluateSafeExpression("window.location", {})).toBeNull()
    })

    it("rejects special characters", () => {
      expect(evaluateSafeExpression("5 = 5", {})).toBeNull()
      expect(evaluateSafeExpression("5 & 3", {})).toBeNull()
      expect(evaluateSafeExpression("5 | 3", {})).toBeNull()
    })

    it("rejects string literals", () => {
      expect(evaluateSafeExpression('"hello"', {})).toBeNull()
    })

    it("rejects semicolons", () => {
      expect(evaluateSafeExpression("1; 2", {})).toBeNull()
    })
  })
})

// ============================================
// parseAggregateExpression
// ============================================
describe("parseAggregateExpression", () => {
  it("parses SUM(current.revenue)", () => {
    const result = parseAggregateExpression("SUM(current.revenue)")
    expect(result).toEqual({ fn: "SUM", context: "current", column: "revenue" })
  })

  it("parses AVG(compare.cost)", () => {
    const result = parseAggregateExpression("AVG(compare.cost)")
    expect(result).toEqual({ fn: "AVG", context: "compare", column: "cost" })
  })

  it("parses COUNT(current.items)", () => {
    const result = parseAggregateExpression("COUNT(current.items)")
    expect(result).toEqual({ fn: "COUNT", context: "current", column: "items" })
  })

  it("parses MIN and MAX", () => {
    expect(parseAggregateExpression("MIN(current.price)")).toEqual({ fn: "MIN", context: "current", column: "price" })
    expect(parseAggregateExpression("MAX(current.price)")).toEqual({ fn: "MAX", context: "current", column: "price" })
  })

  it("is case-insensitive", () => {
    const result = parseAggregateExpression("sum(CURRENT.Revenue)")
    expect(result).not.toBeNull()
    expect(result!.fn).toBe("SUM")
    expect(result!.context).toBe("current")
    expect(result!.column).toBe("revenue")
  })

  it("handles whitespace", () => {
    const result = parseAggregateExpression("  SUM ( current . revenue )  ")
    expect(result).not.toBeNull()
    expect(result!.fn).toBe("SUM")
  })

  it("returns null for invalid expressions", () => {
    expect(parseAggregateExpression("INVALID(current.x)")).toBeNull()
    expect(parseAggregateExpression("SUM(x)")).toBeNull() // Missing context
    expect(parseAggregateExpression("SUM")).toBeNull()
    expect(parseAggregateExpression("")).toBeNull()
    expect(parseAggregateExpression("5 + 3")).toBeNull()
  })
})

// ============================================
// parseSimpleAggregateExpression
// ============================================
describe("parseSimpleAggregateExpression", () => {
  it("parses SUM(revenue)", () => {
    const result = parseSimpleAggregateExpression("SUM(revenue)")
    expect(result).toEqual({ fn: "SUM", column: "revenue" })
  })

  it("parses AVG(cost)", () => {
    const result = parseSimpleAggregateExpression("AVG(cost)")
    expect(result).toEqual({ fn: "AVG", column: "cost" })
  })

  it("handles underscored column names", () => {
    const result = parseSimpleAggregateExpression("SUM(total_amount)")
    expect(result).toEqual({ fn: "SUM", column: "total_amount" })
  })

  it("is case-insensitive for function name", () => {
    const result = parseSimpleAggregateExpression("sum(Revenue)")
    expect(result).not.toBeNull()
    expect(result!.fn).toBe("SUM")
    expect(result!.column).toBe("revenue")
  })

  it("returns null for invalid expressions", () => {
    expect(parseSimpleAggregateExpression("SUM")).toBeNull()
    expect(parseSimpleAggregateExpression("SUM()")).toBeNull()
    expect(parseSimpleAggregateExpression("INVALID(x)")).toBeNull()
    expect(parseSimpleAggregateExpression("5 + 3")).toBeNull()
  })
})

// ============================================
// parseNumericValue
// ============================================
describe("parseNumericValue", () => {
  it("returns numbers as-is", () => {
    expect(parseNumericValue(42)).toBe(42)
    expect(parseNumericValue(3.14)).toBe(3.14)
    expect(parseNumericValue(-100)).toBe(-100)
    expect(parseNumericValue(0)).toBe(0)
  })

  it("returns null for non-finite numbers", () => {
    expect(parseNumericValue(Infinity)).toBeNull()
    expect(parseNumericValue(-Infinity)).toBeNull()
    expect(parseNumericValue(NaN)).toBeNull()
  })

  it("parses plain number strings", () => {
    expect(parseNumericValue("42")).toBe(42)
    expect(parseNumericValue("3.14")).toBe(3.14)
    expect(parseNumericValue("-100")).toBe(-100)
  })

  it("strips currency symbols", () => {
    expect(parseNumericValue("$1234.56")).toBe(1234.56)
    expect(parseNumericValue("£500")).toBe(500)
    expect(parseNumericValue("€99.99")).toBe(99.99)
    expect(parseNumericValue("¥10000")).toBe(10000)
  })

  it("strips commas", () => {
    expect(parseNumericValue("1,234,567")).toBe(1234567)
    expect(parseNumericValue("$1,234.56")).toBe(1234.56)
  })

  it("handles accounting format (parentheses for negative)", () => {
    expect(parseNumericValue("($1,234.56)")).toBe(-1234.56)
    expect(parseNumericValue("(500)")).toBe(-500)
    expect(parseNumericValue("(1,234.56)")).toBe(-1234.56)
  })

  it("strips whitespace", () => {
    expect(parseNumericValue("  42  ")).toBe(42)
    expect(parseNumericValue(" $ 100 ")).toBe(100)
  })

  it("returns null for empty string", () => {
    expect(parseNumericValue("")).toBeNull()
    expect(parseNumericValue("  ")).toBeNull()
  })

  it("returns null for non-numeric strings", () => {
    expect(parseNumericValue("abc")).toBeNull()
    expect(parseNumericValue("hello")).toBeNull()
  })

  it("returns null for non-string/non-number types", () => {
    expect(parseNumericValue(null)).toBeNull()
    expect(parseNumericValue(undefined)).toBeNull()
    expect(parseNumericValue(true)).toBeNull()
    expect(parseNumericValue({})).toBeNull()
    expect(parseNumericValue([])).toBeNull()
  })
})

// ============================================
// computeAggregate
// ============================================
describe("computeAggregate", () => {
  it("computes SUM", () => {
    expect(computeAggregate("SUM", [10, 20, 30])).toBe(60)
  })

  it("computes SUM with decimals (rounds to 2 places)", () => {
    expect(computeAggregate("SUM", [10.111, 20.222])).toBe(30.33)
  })

  it("computes AVG", () => {
    expect(computeAggregate("AVG", [10, 20, 30])).toBe(20)
  })

  it("computes AVG with rounding", () => {
    expect(computeAggregate("AVG", [10, 20, 33])).toBe(21)
  })

  it("computes COUNT", () => {
    expect(computeAggregate("COUNT", [10, 20, 30])).toBe(3)
  })

  it("computes MIN", () => {
    expect(computeAggregate("MIN", [30, 10, 20])).toBe(10)
  })

  it("computes MAX", () => {
    expect(computeAggregate("MAX", [10, 30, 20])).toBe(30)
  })

  it("returns null for empty array", () => {
    expect(computeAggregate("SUM", [])).toBeNull()
    expect(computeAggregate("AVG", [])).toBeNull()
    expect(computeAggregate("COUNT", [])).toBeNull()
  })

  it("handles single value", () => {
    expect(computeAggregate("SUM", [42])).toBe(42)
    expect(computeAggregate("AVG", [42])).toBe(42)
    expect(computeAggregate("MIN", [42])).toBe(42)
    expect(computeAggregate("MAX", [42])).toBe(42)
    expect(computeAggregate("COUNT", [42])).toBe(1)
  })

  it("handles negative values", () => {
    expect(computeAggregate("SUM", [-10, 20, -5])).toBe(5)
    expect(computeAggregate("MIN", [-10, 20, -5])).toBe(-10)
  })
})

// ============================================
// extractColumnValues
// ============================================
describe("extractColumnValues", () => {
  it("extracts numeric values from rows", () => {
    const rows = [
      { amount: 100, name: "A" },
      { amount: 200, name: "B" },
      { amount: 300, name: "C" },
    ]
    expect(extractColumnValues(rows, "amount")).toEqual([100, 200, 300])
  })

  it("skips non-numeric values", () => {
    const rows = [
      { amount: 100 },
      { amount: "not a number" },
      { amount: 300 },
    ]
    expect(extractColumnValues(rows, "amount")).toEqual([100, 300])
  })

  it("skips null/undefined values", () => {
    const rows = [
      { amount: 100 },
      { amount: null },
      { amount: undefined },
      { amount: 200 },
    ]
    expect(extractColumnValues(rows, "amount")).toEqual([100, 200])
  })

  it("parses currency strings", () => {
    const rows = [
      { amount: "$1,234.56" },
      { amount: "£500" },
      { amount: "(100)" },
    ]
    const values = extractColumnValues(rows, "amount")
    expect(values).toEqual([1234.56, 500, -100])
  })

  it("returns empty array for missing column", () => {
    const rows = [{ other: 100 }, { other: 200 }]
    expect(extractColumnValues(rows, "amount")).toEqual([])
  })

  it("returns empty array for empty rows", () => {
    expect(extractColumnValues([], "amount")).toEqual([])
  })
})

// ============================================
// extractReportRefs
// ============================================
describe("extractReportRefs", () => {
  it("extracts a single REF() call", () => {
    const result = extractReportRefs('REF("P&L Report", "GROSS PROFIT")')
    expect(result.refs).toHaveLength(1)
    expect(result.refs[0].reportName).toBe("P&L Report")
    expect(result.refs[0].rowLabel).toBe("GROSS PROFIT")
    expect(result.refs[0].placeholder).toBe("__ref_0")
    expect(result.expression).toBe("__ref_0")
  })

  it("extracts multiple REF() calls", () => {
    const result = extractReportRefs('REF("Report A", "ROW1") + REF("Report B", "ROW2") * 0.5')
    expect(result.refs).toHaveLength(2)
    expect(result.refs[0].reportName).toBe("Report A")
    expect(result.refs[0].rowLabel).toBe("ROW1")
    expect(result.refs[1].reportName).toBe("Report B")
    expect(result.refs[1].rowLabel).toBe("ROW2")
    expect(result.expression).toBe("__ref_0 + __ref_1 * 0.5")
  })

  it("handles expressions with no REF() calls", () => {
    const result = extractReportRefs("[TOTAL REVENUE] - [TOTAL COSTS]")
    expect(result.refs).toHaveLength(0)
    expect(result.expression).toBe("[TOTAL REVENUE] - [TOTAL COSTS]")
  })

  it("handles mixed local refs and REF() calls", () => {
    const result = extractReportRefs('[TOTAL REVENUE] - REF("Other Report", "NET INCOME")')
    expect(result.refs).toHaveLength(1)
    expect(result.expression).toBe("[TOTAL REVENUE] - __ref_0")
  })

  it("preserves the original match string", () => {
    const result = extractReportRefs('REF("My Report", "Total")')
    expect(result.refs[0].original).toBe('REF("My Report", "Total")')
  })

  it("handles whitespace in REF() call", () => {
    const result = extractReportRefs('REF(  "Report" ,  "Row"  )')
    expect(result.refs).toHaveLength(1)
    expect(result.refs[0].reportName).toBe("Report")
    expect(result.refs[0].rowLabel).toBe("Row")
  })

  it("works end-to-end with evaluateSafeExpression", () => {
    const expr = 'REF("Report A", "PROFIT") + [TOTAL REVENUE]'
    const { expression, refs } = extractReportRefs(expr)

    // Simulate resolving the ref value
    const context: Record<string, number> = {
      "TOTAL REVENUE": 1000,
    }
    for (const ref of refs) {
      context[ref.placeholder] = 500  // Simulated REF value
    }

    const result = evaluateSafeExpression(expression, context)
    expect(result).toBe(1500)
  })
})

// ============================================
// hasReportRefs
// ============================================
describe("hasReportRefs", () => {
  it("returns true for expressions with REF()", () => {
    expect(hasReportRefs('REF("Report", "Row")')).toBe(true)
  })

  it("returns false for expressions without REF()", () => {
    expect(hasReportRefs("[TOTAL REVENUE] - [TOTAL COSTS]")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(hasReportRefs("")).toBe(false)
  })

  it("returns false for partial REF syntax", () => {
    expect(hasReportRefs("REF(something)")).toBe(false)
    expect(hasReportRefs('REF("only one arg")')).toBe(false)
  })
})
