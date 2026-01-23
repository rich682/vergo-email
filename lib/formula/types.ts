/**
 * Formula Types
 *
 * Type definitions for the formula system:
 * - FormulaDefinition: Stored formula configuration
 * - AST nodes for parsed formulas
 * - Evaluation context for formula resolution
 *
 * Formula Syntax (Monday.com style with curly braces):
 * - Column references: {Column Name}
 * - Cross-sheet references: {Sheet Name.Column Name}
 * - Functions: SUM({column}), AVERAGE({column}), COUNT, MIN, MAX
 * - Operators: +, -, *, /, (, )
 */

// ============================================
// Formula Definition (Stored)
// ============================================

/**
 * Result type for formula output.
 */
export type FormulaResultType = "number" | "currency" | "text"

/**
 * Reference to a column (optionally in another sheet).
 */
export interface FormulaRef {
  /** Sheet ID (null = current sheet) */
  sheetId: string | null
  /** Sheet label for display (e.g., "Jan 2026") - resolved to sheetId */
  sheetLabel: string | null
  /** Column key to reference */
  columnKey: string
  /** Display name as written in formula (e.g., "{Contract Value}") */
  displayName: string
}

/**
 * Stored formula definition.
 * Formulas are templates applied uniformly to a row or column.
 */
export interface FormulaDefinition {
  /** The formula expression (e.g., "{Contract Value} - {Contract Cost}") */
  expression: string
  /** Parsed references for dependency tracking */
  references: FormulaRef[]
  /** Expected result type */
  resultType: FormulaResultType
}

// ============================================
// AST Nodes (Parsed Formula)
// ============================================

/**
 * AST node types.
 */
export type ASTNodeType =
  | "number"
  | "column_ref"
  | "function_call"
  | "binary_op"
  | "unary_op"
  | "group"

/**
 * Number literal node.
 */
export interface NumberNode {
  type: "number"
  value: number
}

/**
 * Column reference node.
 * Represents a {Column Name} or {Sheet.Column Name} reference.
 */
export interface ColumnRefNode {
  type: "column_ref"
  /** Sheet label (null = current sheet) */
  sheetLabel: string | null
  /** Column name as it appears in the schema */
  columnName: string
  /** Raw text as written (e.g., "{Contract Value}") */
  raw: string
}

/**
 * Function call node.
 * Represents SUM({column}), AVERAGE({column}), etc.
 */
export interface FunctionCallNode {
  type: "function_call"
  /** Function name (uppercase: SUM, AVERAGE, COUNT, MIN, MAX) */
  name: string
  /** Function arguments */
  args: ASTNode[]
}

/**
 * Binary operation node.
 * Represents +, -, *, / operations.
 */
export interface BinaryOpNode {
  type: "binary_op"
  /** Operator: +, -, *, / */
  operator: "+" | "-" | "*" | "/"
  /** Left operand */
  left: ASTNode
  /** Right operand */
  right: ASTNode
}

/**
 * Unary operation node.
 * Represents negation (-x).
 */
export interface UnaryOpNode {
  type: "unary_op"
  /** Operator: - */
  operator: "-"
  /** Operand */
  operand: ASTNode
}

/**
 * Group node (parentheses).
 */
export interface GroupNode {
  type: "group"
  /** Inner expression */
  expression: ASTNode
}

/**
 * Union of all AST node types.
 */
export type ASTNode =
  | NumberNode
  | ColumnRefNode
  | FunctionCallNode
  | BinaryOpNode
  | UnaryOpNode
  | GroupNode

// ============================================
// Evaluation Context
// ============================================

/**
 * Sheet data for evaluation.
 */
export interface SheetData {
  /** Sheet/snapshot ID */
  id: string
  /** Display label (e.g., "Jan 2026") */
  label: string
  /** Row data */
  rows: Record<string, unknown>[]
}

/**
 * Context for evaluating formulas.
 */
export interface FormulaContext {
  /** Current sheet ID */
  currentSheetId: string
  /** All available sheets (sheetId -> SheetData) */
  allSheets: Map<string, SheetData>
  /** Map of sheet labels to sheet IDs for resolution */
  sheetLabelToId: Map<string, string>
  /** Available column definitions */
  columns: Array<{
    key: string
    label: string
    dataType: string
  }>
}

/**
 * Row context for evaluating column formulas.
 * Provides the current row data for column reference resolution.
 */
export interface RowContext {
  /** Current row index (for error messages) */
  rowIndex: number
  /** Current row data */
  row: Record<string, unknown>
  /** Identity key value for this row */
  identity: string
}

/**
 * Column context for evaluating row formulas (aggregation).
 * Provides the column key for aggregate functions.
 */
export interface ColumnContext {
  /** Column key being evaluated */
  columnKey: string
  /** Column label (for error messages) */
  columnLabel: string
}

// ============================================
// Evaluation Result
// ============================================

/**
 * Result of formula evaluation.
 */
export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

// ============================================
// Parse Result
// ============================================

/**
 * Result of formula parsing.
 */
export type ParseResult =
  | { ok: true; ast: ASTNode; references: FormulaRef[] }
  | { ok: false; error: string; position?: number }

// ============================================
// Supported Functions
// ============================================

/**
 * Supported aggregate functions.
 */
export const SUPPORTED_FUNCTIONS = [
  "SUM",
  "AVERAGE",
  "COUNT",
  "MIN",
  "MAX",
] as const

export type SupportedFunction = (typeof SUPPORTED_FUNCTIONS)[number]

/**
 * Check if a string is a supported function name.
 */
export function isSupportedFunction(name: string): name is SupportedFunction {
  return SUPPORTED_FUNCTIONS.includes(name.toUpperCase() as SupportedFunction)
}

// ============================================
// Token Types (for Lexer)
// ============================================

export type TokenType =
  | "NUMBER"
  | "COLUMN_REF"
  | "FUNCTION"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF"

export interface Token {
  type: TokenType
  value: string | number
  position: number
}
