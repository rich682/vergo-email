/**
 * Formula Expansion Service
 *
 * Handles auto-expansion of cell formula ranges when new data is added.
 * When users create formulas like =SUM(H1:H10), this service expands
 * the ranges to include new rows/columns added in subsequent periods.
 *
 * Expansion behavior:
 * - Row orientation: New rows added → vertical ranges expand (H1:H10 → H1:H15)
 * - Column orientation: New columns added → horizontal ranges expand (A1:H1 → A1:M1)
 * - Absolute references ($A$1) are never expanded
 */

import { prisma } from "@/lib/prisma"
import {
  parseCellFormula,
  astToFormula,
  type CellFormulaNode,
  type CellRef,
  type CellRange,
} from "@/lib/formula"

export class FormulaExpansionService {
  /**
   * Expand all formulas for a lineage when new data is added.
   * Called after a new snapshot is created.
   *
   * @param lineageId - The task lineage ID
   * @param newRowCount - New total row count (0-indexed max row)
   * @param newColCount - New total column count (0-indexed max col)
   * @param orientation - Data orientation ("row" or "column")
   */
  static async expandFormulasForNewData(
    lineageId: string,
    newRowCount: number,
    newColCount: number,
    orientation: "row" | "column"
  ): Promise<{ expanded: number; errors: string[] }> {
    const errors: string[] = []
    let expanded = 0

    // Find all formulas for this lineage that have auto-expand enabled
    const formulas = await prisma.cellFormula.findMany({
      where: {
        lineageId,
        autoExpand: true,
        expansionAxis: orientation,
      },
    })

    for (const formula of formulas) {
      try {
        // Determine if expansion is needed
        const originalMax = orientation === "row"
          ? formula.originalMaxRow
          : formula.originalMaxCol
        const newMax = orientation === "row"
          ? newRowCount - 1  // Convert count to 0-indexed
          : newColCount - 1

        // Skip if no original bound recorded or no expansion needed
        if (originalMax === null || newMax <= originalMax) {
          continue
        }

        // Expand the formula
        const expandedFormula = this.expandFormulaRanges(
          formula.formula,
          orientation,
          originalMax,
          newMax
        )

        if (expandedFormula && expandedFormula !== formula.formula) {
          // Update the formula in the database
          await prisma.cellFormula.update({
            where: { id: formula.id },
            data: {
              formula: expandedFormula,
              // Update the original max to the new value
              ...(orientation === "row"
                ? { originalMaxRow: newMax }
                : { originalMaxCol: newMax }),
              updatedAt: new Date(),
            },
          })
          expanded++
        }
      } catch (err) {
        errors.push(
          `Failed to expand formula ${formula.cellRef}: ${err instanceof Error ? err.message : "Unknown error"}`
        )
      }
    }

    return { expanded, errors }
  }

  /**
   * Expand ranges in a formula string.
   *
   * @param formula - The formula string (e.g., "=SUM(H1:H10)")
   * @param axis - Which axis to expand ("row" or "column")
   * @param oldMax - The old maximum index (0-indexed)
   * @param newMax - The new maximum index (0-indexed)
   * @returns The expanded formula string, or null if parsing failed
   */
  static expandFormulaRanges(
    formula: string,
    axis: "row" | "column",
    oldMax: number,
    newMax: number
  ): string | null {
    const parseResult = parseCellFormula(formula)
    if (!parseResult.ok) {
      return null
    }

    const expandedAst = this.expandNode(parseResult.ast, axis, oldMax, newMax)
    return "=" + astToFormula(expandedAst)
  }

  /**
   * Recursively expand ranges in an AST node.
   */
  private static expandNode(
    node: CellFormulaNode,
    axis: "row" | "column",
    oldMax: number,
    newMax: number
  ): CellFormulaNode {
    switch (node.type) {
      case "number":
        return node

      case "cell_ref":
        // Single cell references don't expand (only ranges do)
        return node

      case "range":
        return {
          type: "range",
          range: this.expandRange(node.range, axis, oldMax, newMax),
        }

      case "binary_op":
        return {
          type: "binary_op",
          operator: node.operator,
          left: this.expandNode(node.left, axis, oldMax, newMax),
          right: this.expandNode(node.right, axis, oldMax, newMax),
        }

      case "unary_op":
        return {
          type: "unary_op",
          operator: node.operator,
          operand: this.expandNode(node.operand, axis, oldMax, newMax),
        }

      case "function_call":
        return {
          type: "function_call",
          name: node.name,
          args: node.args.map((arg) =>
            this.expandNode(arg, axis, oldMax, newMax)
          ),
        }

      case "group":
        return {
          type: "group",
          expression: this.expandNode(node.expression, axis, oldMax, newMax),
        }
    }
  }

  /**
   * Expand a cell range if its end matches the old max.
   */
  private static expandRange(
    range: CellRange,
    axis: "row" | "column",
    oldMax: number,
    newMax: number
  ): CellRange {
    const { start, end } = range

    if (axis === "row") {
      // Expand row range if end row matches oldMax and is not absolute
      if (!end.absRow && end.row === oldMax) {
        return {
          start,
          end: { ...end, row: newMax },
        }
      }
    } else {
      // Expand column range if end column matches oldMax and is not absolute
      if (!end.absCol && end.col === oldMax) {
        return {
          start,
          end: { ...end, col: newMax },
        }
      }
    }

    // No expansion needed
    return range
  }

  /**
   * Check if a formula contains expandable ranges.
   * Used to determine if a formula should have auto-expand enabled.
   */
  static hasExpandableRanges(formula: string): boolean {
    const parseResult = parseCellFormula(formula)
    if (!parseResult.ok) return false

    return this.nodeHasRanges(parseResult.ast)
  }

  private static nodeHasRanges(node: CellFormulaNode): boolean {
    switch (node.type) {
      case "range":
        return true
      case "binary_op":
        return (
          this.nodeHasRanges(node.left) || this.nodeHasRanges(node.right)
        )
      case "unary_op":
        return this.nodeHasRanges(node.operand)
      case "function_call":
        return node.args.some((arg) => this.nodeHasRanges(arg))
      case "group":
        return this.nodeHasRanges(node.expression)
      default:
        return false
    }
  }
}
