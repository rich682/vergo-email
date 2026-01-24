/**
 * Formula Evaluator
 *
 * Evaluates parsed formula AST against data context.
 *
 * Two evaluation modes:
 * 1. Column formula: Evaluated per-row (e.g., {Revenue} - {Cost})
 * 2. Row formula: Evaluated per-column with aggregation (e.g., SUM({column}))
 *
 * Cross-sheet references are resolved by looking up the sheet label
 * in the formula context's sheetLabelToId map.
 */

import type {
  ASTNode,
  FormulaContext,
  RowContext,
  ColumnContext,
  FormulaResult,
  FormulaDefinition,
} from "./types"
import { parseFormula } from "./parser"

// ============================================
// Column Value Resolution
// ============================================

/**
 * Resolve a column reference to a numeric value.
 * Handles cross-sheet references.
 */
function resolveColumnValue(
  columnName: string,
  sheetLabel: string | null,
  context: FormulaContext,
  rowContext: RowContext
): FormulaResult {
  // Find the column by label (columnName is the display name)
  const column = context.columns.find(
    (c) => c.label.toLowerCase() === columnName.toLowerCase() || c.key === columnName
  )

  if (!column) {
    return { ok: false, error: `Column "${columnName}" not found` }
  }

  // Determine which sheet to read from
  let sheetId = context.currentSheetId
  if (sheetLabel) {
    const resolvedId = context.sheetLabelToId.get(sheetLabel)
    if (!resolvedId) {
      return { ok: false, error: `Sheet "${sheetLabel}" not found` }
    }
    sheetId = resolvedId
  }

  // Get the sheet data
  const sheetData = context.allSheets.get(sheetId)
  if (!sheetData) {
    return { ok: false, error: `Sheet data not found for ID "${sheetId}"` }
  }

  // If cross-sheet, we need to find the matching row by identity
  let row: Record<string, unknown>
  if (sheetLabel && sheetId !== context.currentSheetId) {
    // Find the row with matching identity in the other sheet
    // This requires an identity column match
    const matchingRow = sheetData.rows.find((r) => {
      // Try to match by common identity keys
      const identityKeys = ["id", "identity", "rowId"]
      for (const key of identityKeys) {
        if (r[key] === rowContext.identity) {
          return true
        }
      }
      // Also try matching by the identity value itself
      return Object.values(r).some((v) => String(v) === rowContext.identity)
    })

    if (!matchingRow) {
      return { ok: false, error: `No matching row found in sheet "${sheetLabel}" for identity "${rowContext.identity}"` }
    }
    row = matchingRow
  } else {
    row = rowContext.row
  }

  // Get the value
  const rawValue = row[column.key]

  // Convert to number
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { ok: true, value: 0 }
  }

  if (typeof rawValue === "number") {
    return { ok: true, value: rawValue }
  }

  if (typeof rawValue === "string") {
    // Remove currency symbols and commas
    const cleaned = rawValue.replace(/[$,€£¥]/g, "").trim()
    const num = parseFloat(cleaned)
    if (isNaN(num)) {
      return { ok: false, error: `Cannot convert "${rawValue}" to number in column "${columnName}"` }
    }
    return { ok: true, value: num }
  }

  return { ok: false, error: `Unexpected value type in column "${columnName}"` }
}

// ============================================
// Aggregate Functions
// ============================================

/**
 * Get all values from a column across all rows.
 */
function getColumnValues(
  columnKey: string,
  context: FormulaContext,
  sheetId?: string
): number[] {
  const targetSheetId = sheetId || context.currentSheetId
  const sheetData = context.allSheets.get(targetSheetId)
  
  if (!sheetData) return []

  const values: number[] = []
  for (const row of sheetData.rows) {
    const rawValue = row[columnKey]
    
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue
    }

    if (typeof rawValue === "number") {
      values.push(rawValue)
      continue
    }

    if (typeof rawValue === "string") {
      const cleaned = rawValue.replace(/[$,€£¥]/g, "").trim()
      const num = parseFloat(cleaned)
      if (!isNaN(num)) {
        values.push(num)
      }
    }
  }

  return values
}

/**
 * Execute an aggregate function on a set of values.
 */
function executeAggregate(
  funcName: string,
  values: number[]
): FormulaResult {
  if (values.length === 0) {
    return { ok: true, value: 0 }
  }

  switch (funcName) {
    case "SUM":
      return { ok: true, value: values.reduce((a, b) => a + b, 0) }

    case "AVERAGE":
      return { ok: true, value: values.reduce((a, b) => a + b, 0) / values.length }

    case "COUNT":
      return { ok: true, value: values.length }

    case "MIN":
      return { ok: true, value: Math.min(...values) }

    case "MAX":
      return { ok: true, value: Math.max(...values) }

    default:
      return { ok: false, error: `Unknown function "${funcName}"` }
  }
}

// ============================================
// AST Evaluation (Column Formula)
// ============================================

/**
 * Evaluate an AST node for a column formula (per-row evaluation).
 */
function evaluateNode(
  node: ASTNode,
  context: FormulaContext,
  rowContext: RowContext
): FormulaResult {
  switch (node.type) {
    case "number":
      return { ok: true, value: node.value }

    case "column_ref":
      return resolveColumnValue(
        node.columnName,
        node.sheetLabel,
        context,
        rowContext
      )

    case "binary_op": {
      const leftResult = evaluateNode(node.left, context, rowContext)
      if (!leftResult.ok) return leftResult

      const rightResult = evaluateNode(node.right, context, rowContext)
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
        default:
          // This should never happen if types are correct
          return { ok: false, error: `Unknown operator "${(node as any).operator}"` }
      }
    }

    case "unary_op": {
      const operandResult = evaluateNode(node.operand, context, rowContext)
      if (!operandResult.ok) return operandResult

      switch (node.operator) {
        case "-":
          return { ok: true, value: -operandResult.value }
        default:
          // This should never happen if types are correct
          return { ok: false, error: `Unknown unary operator "${(node as any).operator}"` }
      }
    }

    case "group":
      return evaluateNode(node.expression, context, rowContext)

    case "function_call": {
      // For column formulas, functions aggregate over the column in current row context
      // This is a bit unusual - typically functions in column formulas are used
      // to reference aggregates from other sheets
      
      // For now, if a function is used in a column formula, we evaluate each arg
      // and pass to the aggregate function
      const values: number[] = []
      
      for (const arg of node.args) {
        const argResult = evaluateNode(arg, context, rowContext)
        if (!argResult.ok) return argResult
        values.push(argResult.value)
      }
      
      return executeAggregate(node.name, values)
    }

    default:
      return { ok: false, error: `Unknown node type` }
  }
}

// ============================================
// Row Formula Evaluation
// ============================================

/**
 * Evaluate a row formula for a specific column.
 * Row formulas typically aggregate values in a column.
 *
 * The special reference {column} is replaced with the actual column being evaluated.
 */
function evaluateRowFormulaNode(
  node: ASTNode,
  context: FormulaContext,
  columnContext: ColumnContext
): FormulaResult {
  switch (node.type) {
    case "number":
      return { ok: true, value: node.value }

    case "column_ref": {
      // In row formulas, {column} is a special reference to the current column
      if (node.columnName.toLowerCase() === "column") {
        const values = getColumnValues(columnContext.columnKey, context)
        // For a raw column reference in a row formula, sum is implied
        return { ok: true, value: values.reduce((a, b) => a + b, 0) }
      }

      // Otherwise, resolve normally (aggregate over the referenced column)
      const column = context.columns.find(
        (c) => c.label.toLowerCase() === node.columnName.toLowerCase() || c.key === node.columnName
      )

      if (!column) {
        return { ok: false, error: `Column "${node.columnName}" not found` }
      }

      const values = getColumnValues(column.key, context)
      return { ok: true, value: values.reduce((a, b) => a + b, 0) }
    }

    case "binary_op": {
      const leftResult = evaluateRowFormulaNode(node.left, context, columnContext)
      if (!leftResult.ok) return leftResult

      const rightResult = evaluateRowFormulaNode(node.right, context, columnContext)
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
        default:
          // This should never happen if types are correct
          return { ok: false, error: `Unknown operator "${(node as any).operator}"` }
      }
    }

    case "unary_op": {
      const operandResult = evaluateRowFormulaNode(node.operand, context, columnContext)
      if (!operandResult.ok) return operandResult

      switch (node.operator) {
        case "-":
          return { ok: true, value: -operandResult.value }
        default:
          // This should never happen if types are correct
          return { ok: false, error: `Unknown unary operator "${(node as any).operator}"` }
      }
    }

    case "group":
      return evaluateRowFormulaNode(node.expression, context, columnContext)

    case "function_call": {
      // For row formulas, functions aggregate over columns
      // SUM({column}) means sum of all values in the current column
      
      if (node.args.length === 0) {
        return { ok: false, error: `Function ${node.name} requires at least one argument` }
      }

      // Special handling for {column} reference
      const arg = node.args[0]
      if (arg.type === "column_ref" && arg.columnName.toLowerCase() === "column") {
        const values = getColumnValues(columnContext.columnKey, context)
        return executeAggregate(node.name, values)
      }

      // Otherwise, evaluate each argument as a column reference
      const values: number[] = []
      for (const a of node.args) {
        if (a.type === "column_ref") {
          const column = context.columns.find(
            (c) => c.label.toLowerCase() === a.columnName.toLowerCase() || c.key === a.columnName
          )
          if (column) {
            const colValues = getColumnValues(column.key, context)
            values.push(...colValues)
          }
        } else {
          const result = evaluateRowFormulaNode(a, context, columnContext)
          if (!result.ok) return result
          values.push(result.value)
        }
      }

      return executeAggregate(node.name, values)
    }

    default:
      return { ok: false, error: `Unknown node type` }
  }
}

// ============================================
// Public API
// ============================================

/**
 * Evaluate a column formula for a specific row.
 * Column formulas are applied uniformly to each row.
 *
 * @param formula The parsed formula definition
 * @param context The formula evaluation context
 * @param rowContext The current row context
 * @returns FormulaResult with the calculated value or error
 */
export function evaluateColumnFormula(
  formula: FormulaDefinition,
  context: FormulaContext,
  rowContext: RowContext
): FormulaResult {
  const parseResult = parseFormula(formula.expression)
  
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error }
  }

  return evaluateNode(parseResult.ast, context, rowContext)
}

/**
 * Evaluate a row formula for a specific column.
 * Row formulas typically aggregate values in a column.
 *
 * @param formula The parsed formula definition
 * @param context The formula evaluation context
 * @param columnContext The current column context
 * @returns FormulaResult with the calculated value or error
 */
export function evaluateRowFormula(
  formula: FormulaDefinition,
  context: FormulaContext,
  columnContext: ColumnContext
): FormulaResult {
  const parseResult = parseFormula(formula.expression)
  
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error }
  }

  return evaluateRowFormulaNode(parseResult.ast, context, columnContext)
}

/**
 * Evaluate a formula expression directly (without pre-parsed definition).
 * Useful for preview/testing.
 *
 * @param expression The formula expression
 * @param context The formula evaluation context
 * @param rowContext The current row context (for column formulas)
 * @returns FormulaResult with the calculated value or error
 */
export function evaluateExpression(
  expression: string,
  context: FormulaContext,
  rowContext: RowContext
): FormulaResult {
  const parseResult = parseFormula(expression)
  
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error }
  }

  return evaluateNode(parseResult.ast, context, rowContext)
}

/**
 * Create an empty formula context.
 * Useful for testing or when no sheets are available.
 */
export function createEmptyFormulaContext(): FormulaContext {
  return {
    currentSheetId: "",
    allSheets: new Map(),
    sheetLabelToId: new Map(),
    columns: [],
  }
}

/**
 * Build a formula context from sheet data.
 *
 * @param currentSheetId The current sheet ID
 * @param sheets Array of sheet data
 * @param columns Column definitions
 * @returns FormulaContext for evaluation
 */
export function buildFormulaContext(
  currentSheetId: string,
  sheets: Array<{ id: string; label: string; rows: Record<string, unknown>[] }>,
  columns: Array<{ key: string; label: string; dataType: string }>
): FormulaContext {
  const allSheets = new Map<string, { id: string; label: string; rows: Record<string, unknown>[] }>()
  const sheetLabelToId = new Map<string, string>()

  for (const sheet of sheets) {
    allSheets.set(sheet.id, sheet)
    if (sheet.label) {
      sheetLabelToId.set(sheet.label, sheet.id)
    }
  }

  return {
    currentSheetId,
    allSheets,
    sheetLabelToId,
    columns,
  }
}
