/**
 * Formula Library
 *
 * Provides formula parsing and evaluation for the data grid.
 *
 * Usage:
 * ```typescript
 * import { parseFormula, evaluateColumnFormula, buildFormulaContext } from "@/lib/formula"
 *
 * // Parse a formula
 * const result = parseFormula("{Revenue} - {Cost}")
 * if (result.ok) {
 *   console.log(result.ast, result.references)
 * }
 *
 * // Evaluate a column formula
 * const context = buildFormulaContext(currentSheetId, sheets, columns)
 * const rowContext = { rowIndex: 0, row: data[0], identity: "row-1" }
 * const value = evaluateColumnFormula(formula, context, rowContext)
 * ```
 */

// Types
export type {
  FormulaDefinition,
  FormulaRef,
  FormulaResultType,
  FormulaContext,
  RowContext,
  ColumnContext,
  FormulaResult,
  ParseResult,
  ASTNode,
  ASTNodeType,
  NumberNode,
  ColumnRefNode,
  FunctionCallNode,
  BinaryOpNode,
  UnaryOpNode,
  GroupNode,
  SheetData,
  Token,
  TokenType,
  SupportedFunction,
} from "./types"

export {
  SUPPORTED_FUNCTIONS,
  isSupportedFunction,
} from "./types"

// Parser
export {
  parseFormula,
  tokenize,
  validateFormulaSyntax,
  extractColumnReferences,
} from "./parser"

// Evaluator
export {
  evaluateColumnFormula,
  evaluateRowFormula,
  evaluateExpression,
  createEmptyFormulaContext,
  buildFormulaContext,
} from "./evaluator"

// Cell Formula Parser (Excel-style A1 references)
export {
  parseCellFormula,
  isFormula,
  columnToLetter,
  letterToColumn,
  formatCellRef,
  adjustCellRef,
  extractCellRefs,
  adjustFormulaRefs,
  astToFormula,
} from "./cell-parser"

export type {
  CellRef,
  CellRange,
  CellFormulaNode,
  ParseResult as CellParseResult,
} from "./cell-parser"

// Cell Formula Evaluator
export {
  evaluateCellFormula,
  evaluateCellFormulaString,
  buildCellEvalContext,
  formatCellResult,
} from "./cell-evaluator"

export type {
  SheetData as CellSheetData,
  CellEvalContext,
  CellEvalResult,
} from "./cell-evaluator"
