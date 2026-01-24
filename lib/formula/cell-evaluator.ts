/**
 * Excel-Style Cell Formula Evaluator
 *
 * Evaluates parsed cell formula ASTs against grid data.
 * Supports:
 * - Cell references (A1, B5)
 * - Ranges (A1:H1)
 * - Cross-sheet references ('Sheet Name'!A1)
 * - Functions (SUM, AVERAGE, COUNT, MIN, MAX)
 * - Arithmetic (+, -, *, /)
 */

import type { CellFormulaNode, CellRef, CellRange } from "./cell-parser"

// ============================================
// Types
// ============================================

export interface SheetData {
  id: string
  label: string
  rows: Record<string, unknown>[]
  columns: { key: string; label: string }[]
}

export interface CellEvalContext {
  currentSheetId: string
  sheets: Map<string, SheetData>          // sheetId -> data
  sheetLabelToId: Map<string, string>     // sheet label -> sheetId
  columnKeyToIndex: Map<string, number>   // column key -> 0-based index
  columnIndexToKey: Map<number, string>   // 0-based index -> column key
}

export type CellEvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

// ============================================
// Context Builder
// ============================================

/**
 * Build evaluation context from grid data.
 */
export function buildCellEvalContext(
  currentSheetId: string,
  sheets: { id: string; label: string; rows: Record<string, unknown>[] }[],
  columns: { key: string; label: string }[]
): CellEvalContext {
  const sheetsMap = new Map<string, SheetData>()
  const sheetLabelToId = new Map<string, string>()
  const columnKeyToIndex = new Map<string, number>()
  const columnIndexToKey = new Map<number, string>()
  
  // Build sheet maps
  for (const sheet of sheets) {
    sheetsMap.set(sheet.id, { ...sheet, columns })
    sheetLabelToId.set(sheet.label, sheet.id)
  }
  
  // Build column maps (0-indexed, matching Excel A=0, B=1, etc.)
  columns.forEach((col, index) => {
    columnKeyToIndex.set(col.key, index)
    columnIndexToKey.set(index, col.key)
  })
  
  return {
    currentSheetId,
    sheets: sheetsMap,
    sheetLabelToId,
    columnKeyToIndex,
    columnIndexToKey,
  }
}

// ============================================
// Cell Value Resolution
// ============================================

/**
 * Get the numeric value of a cell.
 */
function getCellValue(ref: CellRef, context: CellEvalContext): CellEvalResult {
  // Determine which sheet to read from
  let sheetId = context.currentSheetId
  if (ref.sheet) {
    const resolvedId = context.sheetLabelToId.get(ref.sheet)
    if (!resolvedId) {
      return { ok: false, error: `Sheet "${ref.sheet}" not found` }
    }
    sheetId = resolvedId
  }
  
  // Get sheet data
  const sheetData = context.sheets.get(sheetId)
  if (!sheetData) {
    return { ok: false, error: `Sheet data not found` }
  }
  
  // Get row (0-indexed)
  const row = sheetData.rows[ref.row]
  if (!row) {
    return { ok: true, value: 0 } // Empty cell = 0
  }
  
  // Get column key
  const columnKey = context.columnIndexToKey.get(ref.col)
  if (!columnKey) {
    return { ok: false, error: `Column ${ref.col} not found` }
  }
  
  // Get cell value
  const rawValue = row[columnKey]
  
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { ok: true, value: 0 } // Empty cell = 0
  }
  
  if (typeof rawValue === "number") {
    return { ok: true, value: rawValue }
  }
  
  if (typeof rawValue === "string") {
    // Try to parse as number (handle currency, commas, etc.)
    const cleaned = rawValue.replace(/[$,€£¥]/g, "").trim()
    const num = parseFloat(cleaned)
    if (!isNaN(num)) {
      return { ok: true, value: num }
    }
    return { ok: false, error: `Cannot convert "${rawValue}" to number` }
  }
  
  return { ok: false, error: `Unexpected value type` }
}

/**
 * Get all numeric values in a range.
 */
function getRangeValues(range: CellRange, context: CellEvalContext): number[] {
  const values: number[] = []
  
  const startCol = Math.min(range.start.col, range.end.col)
  const endCol = Math.max(range.start.col, range.end.col)
  const startRow = Math.min(range.start.row, range.end.row)
  const endRow = Math.max(range.start.row, range.end.row)
  
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const ref: CellRef = {
        col,
        row,
        absCol: false,
        absRow: false,
        sheet: range.start.sheet,
      }
      const result = getCellValue(ref, context)
      if (result.ok) {
        values.push(result.value)
      }
      // Skip non-numeric values silently (like Excel)
    }
  }
  
  return values
}

// ============================================
// Function Evaluation
// ============================================

function evaluateFunction(name: string, args: CellFormulaNode[], context: CellEvalContext): CellEvalResult {
  // Collect all values from arguments (expanding ranges)
  const values: number[] = []
  
  for (const arg of args) {
    if (arg.type === "range") {
      values.push(...getRangeValues(arg.range, context))
    } else {
      const result = evaluateNode(arg, context)
      if (!result.ok) return result
      values.push(result.value)
    }
  }
  
  if (values.length === 0) {
    return { ok: true, value: 0 }
  }
  
  switch (name) {
    case "SUM":
      return { ok: true, value: values.reduce((a, b) => a + b, 0) }
    
    case "AVERAGE":
    case "AVG":
      return { ok: true, value: values.reduce((a, b) => a + b, 0) / values.length }
    
    case "COUNT":
      return { ok: true, value: values.length }
    
    case "MIN":
      return { ok: true, value: Math.min(...values) }
    
    case "MAX":
      return { ok: true, value: Math.max(...values) }
    
    case "ABS":
      if (values.length !== 1) {
        return { ok: false, error: "ABS requires exactly 1 argument" }
      }
      return { ok: true, value: Math.abs(values[0]) }
    
    case "ROUND":
      if (values.length < 1 || values.length > 2) {
        return { ok: false, error: "ROUND requires 1 or 2 arguments" }
      }
      const decimals = values.length === 2 ? values[1] : 0
      const factor = Math.pow(10, decimals)
      return { ok: true, value: Math.round(values[0] * factor) / factor }
    
    default:
      return { ok: false, error: `Unknown function: ${name}` }
  }
}

// ============================================
// AST Evaluation
// ============================================

function evaluateNode(node: CellFormulaNode, context: CellEvalContext): CellEvalResult {
  switch (node.type) {
    case "number":
      return { ok: true, value: node.value }
    
    case "cell_ref":
      return getCellValue(node.ref, context)
    
    case "range":
      // A range by itself sums its values (like Excel when not in a function)
      const values = getRangeValues(node.range, context)
      return { ok: true, value: values.reduce((a, b) => a + b, 0) }
    
    case "binary_op": {
      const leftResult = evaluateNode(node.left, context)
      if (!leftResult.ok) return leftResult
      
      const rightResult = evaluateNode(node.right, context)
      if (!rightResult.ok) return rightResult
      
      switch (node.operator) {
        case "+":
          return { ok: true, value: leftResult.value + rightResult.value }
        case "-":
          return { ok: true, value: leftResult.value - rightResult.value }
        case "*":
          return { ok: true, value: leftResult.value * rightResult.value }
        case "/":
          if (rightResult.value === 0) {
            return { ok: false, error: "Division by zero" }
          }
          return { ok: true, value: leftResult.value / rightResult.value }
      }
    }
    
    case "unary_op":
      const operandResult = evaluateNode(node.operand, context)
      if (!operandResult.ok) return operandResult
      return { ok: true, value: -operandResult.value }
    
    case "function_call":
      return evaluateFunction(node.name, node.args, context)
    
    case "group":
      return evaluateNode(node.expression, context)
  }
}

// ============================================
// Public API
// ============================================

/**
 * Evaluate a parsed cell formula AST.
 */
export function evaluateCellFormula(
  ast: CellFormulaNode,
  context: CellEvalContext
): CellEvalResult {
  try {
    return evaluateNode(ast, context)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Evaluation error" }
  }
}

/**
 * Parse and evaluate a formula string in one step.
 */
export function evaluateCellFormulaString(
  formula: string,
  context: CellEvalContext
): CellEvalResult {
  // Import parser dynamically to avoid circular dependency
  const { parseCellFormula } = require("./cell-parser")
  
  const parseResult = parseCellFormula(formula)
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error }
  }
  
  return evaluateCellFormula(parseResult.ast, context)
}

/**
 * Format a result value for display.
 */
export function formatCellResult(value: number, type: "number" | "currency" = "number"): string {
  if (type === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value)
  }
  return value.toLocaleString()
}
