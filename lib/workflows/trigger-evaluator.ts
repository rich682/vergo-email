/**
 * Trigger Evaluator
 *
 * Evaluates data-condition triggers by querying database rows
 * and resolving template variables from the active board period.
 */

import { prisma } from "@/lib/prisma"
import type { DataConditionTriggerConditions } from "./types"

interface EvaluationResult {
  matched: boolean
  matchedRowCount: number
  periodKey?: string // For idempotency key generation
  resolvedValue?: unknown // Template-resolved value
}

/**
 * Evaluate a data_condition trigger against database rows.
 * Returns whether the condition is met and context for workflow execution.
 */
export async function evaluateDataCondition(
  conditions: DataConditionTriggerConditions,
  organizationId: string
): Promise<EvaluationResult> {
  const { databaseId, columnKey, operator, value, boardScope } = conditions

  // Load the database
  const database = await prisma.database.findFirst({
    where: { id: databaseId, organizationId },
    select: { rows: true, schema: true },
  })

  if (!database) {
    console.warn(`[TriggerEvaluator] Database ${databaseId} not found for org ${organizationId}`)
    return { matched: false, matchedRowCount: 0 }
  }

  const rows = (database.rows || []) as Record<string, unknown>[]
  if (rows.length === 0) {
    return { matched: false, matchedRowCount: 0 }
  }

  // Resolve template variables if boardScope is set
  let resolvedValue = value
  let periodKey: string | undefined

  if (boardScope === "current_period") {
    const resolution = await resolveTemplateVars(value, organizationId)
    resolvedValue = resolution.resolvedValue
    periodKey = resolution.periodKey
  }

  // Evaluate the condition against rows
  const matchedRowCount = countMatchingRows(rows, columnKey, operator, resolvedValue)

  return {
    matched: matchedRowCount > 0,
    matchedRowCount,
    periodKey,
    resolvedValue,
  }
}

/**
 * Resolve template variables like {{board.periodStart}} and {{board.periodEnd}}
 * from the organization's most recent active (non-complete) board.
 */
async function resolveTemplateVars(
  value: unknown,
  organizationId: string
): Promise<{ resolvedValue: unknown; periodKey?: string }> {
  // Find the most recent active board (IN_PROGRESS or NOT_STARTED)
  const activeBoard = await prisma.board.findFirst({
    where: {
      organizationId,
      status: { in: ["IN_PROGRESS", "NOT_STARTED"] },
      periodStart: { not: null },
      periodEnd: { not: null },
    },
    orderBy: { periodStart: "desc" },
    select: { periodStart: true, periodEnd: true, cadence: true },
  })

  if (!activeBoard?.periodStart || !activeBoard?.periodEnd) {
    console.warn(`[TriggerEvaluator] No active board with period found for org ${organizationId}`)
    return { resolvedValue: value }
  }

  const periodStart = activeBoard.periodStart.toISOString().split("T")[0]
  const periodEnd = activeBoard.periodEnd.toISOString().split("T")[0]

  // Derive periodKey from periodStart
  const startDate = activeBoard.periodStart
  const year = startDate.getFullYear()
  const month = String(startDate.getMonth() + 1).padStart(2, "0")
  const periodKey = `${year}-${month}`

  // Resolve template in value
  const resolvedValue = resolveInValue(value, { periodStart, periodEnd })

  return { resolvedValue, periodKey }
}

/**
 * Recursively resolve {{board.periodStart}} and {{board.periodEnd}} in a value.
 */
function resolveInValue(
  val: unknown,
  vars: { periodStart: string; periodEnd: string }
): unknown {
  if (typeof val === "string") {
    return val
      .replace(/\{\{board\.periodStart\}\}/g, vars.periodStart)
      .replace(/\{\{board\.periodEnd\}\}/g, vars.periodEnd)
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveInValue(item, vars))
  }
  return val
}

/**
 * Count rows in a database that match the given column condition.
 */
function countMatchingRows(
  rows: Record<string, unknown>[],
  columnKey: string,
  operator: string,
  value: unknown
): number {
  let count = 0

  for (const row of rows) {
    const cellValue = row[columnKey]
    if (cellValue === null || cellValue === undefined) continue

    if (evaluateCondition(cellValue, operator, value)) {
      count++
    }
  }

  return count
}

/**
 * Evaluate a single condition: cellValue <operator> value.
 */
function evaluateCondition(
  cellValue: unknown,
  operator: string,
  value: unknown
): boolean {
  switch (operator) {
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) return false
      const [low, high] = value as [string, string]
      const cell = String(cellValue)
      return cell >= low && cell <= high
    }
    case "eq":
      return String(cellValue) === String(value)
    case "gt":
      return Number(cellValue) > Number(value)
    case "lt":
      return Number(cellValue) < Number(value)
    case "gte":
      return Number(cellValue) >= Number(value)
    case "lte":
      return Number(cellValue) <= Number(value)
    case "contains":
      return String(cellValue).toLowerCase().includes(String(value).toLowerCase())
    default:
      return false
  }
}
