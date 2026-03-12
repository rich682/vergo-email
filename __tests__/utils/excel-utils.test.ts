/**
 * Tests for Excel Utilities
 *
 * Note: parseExcelFile and generateSchemaTemplate require actual XLSX binary
 * buffers, so we test the value coercion and type inference functions that
 * can be tested without XLSX dependency.
 */

import { describe, it, expect } from "vitest"
import { inferDataType } from "@/lib/utils/excel-utils"

// We need to access the private coerceValue through the public parseExcelWithSchema
// but since coerceValue is not exported, we test it indirectly through inferDataType
// and through the parseNumericValue tests in safe-expression.test.ts.

// ============================================
// inferDataType
// ============================================
describe("inferDataType", () => {
  it("returns 'text' for empty array", () => {
    expect(inferDataType([])).toBe("text")
  })

  it("returns 'text' for all null/undefined values", () => {
    expect(inferDataType([null, null, undefined])).toBe("text")
  })

  it("detects boolean type", () => {
    expect(inferDataType(["true", "false", "yes", "no"])).toBe("boolean")
    expect(inferDataType(["True", "False"])).toBe("boolean")
    expect(inferDataType(["1", "0"])).toBe("boolean")
    expect(inferDataType(["y", "n"])).toBe("boolean")
    expect(inferDataType(["Y", "N", "yes"])).toBe("boolean")
  })

  it("detects number type", () => {
    expect(inferDataType(["42", "100", "3.14"])).toBe("number")
    expect(inferDataType([42, 100, 3.14])).toBe("number")
    expect(inferDataType(["-10", "0", "99"])).toBe("number")
  })

  it("detects currency type (with symbols)", () => {
    expect(inferDataType(["$100.00", "$200.50", "$300.00"])).toBe("currency")
    expect(inferDataType(["£500.00", "£100.00"])).toBe("currency")
    expect(inferDataType(["$1,234.56", "$5,678.90"])).toBe("currency")
  })

  it("detects currency type (accounting format)", () => {
    expect(inferDataType(["($100.00)", "$200.00", "$300.00"])).toBe("currency")
  })

  it("detects currency type (numbers with 2 decimals and commas)", () => {
    expect(inferDataType(["1,234.56", "5,678.90", "1,000.00"])).toBe("currency")
  })

  it("detects date type (YYYY-MM-DD)", () => {
    expect(inferDataType(["2026-01-15", "2026-02-28", "2026-03-01"])).toBe("date")
  })

  it("detects date type (MM/DD/YYYY)", () => {
    expect(inferDataType(["01/15/2026", "02/28/2026", "03/01/2026"])).toBe("date")
  })

  it("detects date type (MM-DD-YYYY)", () => {
    expect(inferDataType(["01-15-2026", "02-28-2026"])).toBe("date")
  })

  it("detects date type (short format)", () => {
    expect(inferDataType(["1/15/24", "2/28/24"])).toBe("date")
  })

  it("defaults to text for mixed types", () => {
    expect(inferDataType(["hello", "42", "2026-01-01"])).toBe("text")
  })

  it("defaults to text for plain strings", () => {
    expect(inferDataType(["hello", "world", "foo"])).toBe("text")
  })

  it("uses 70% threshold for type detection", () => {
    // 3 numbers + 1 text = 75% numeric → number
    expect(inferDataType(["42", "100", "3.14", "text"])).toBe("number")
    // 2 numbers + 2 text = 50% numeric → text (below 70% threshold)
    expect(inferDataType(["42", "100", "text", "other"])).toBe("text")
  })

  it("skips null/empty values when detecting types", () => {
    // All non-empty values are numbers, despite having nulls
    expect(inferDataType([null, "42", "", "100", null])).toBe("number")
  })
})
