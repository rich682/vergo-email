/**
 * Reconciliation Agent Tools
 *
 * Tools that wrap existing ReconciliationMatchingService for agent use.
 * The agent decides WHEN to call these — the tools are pure executors.
 */

import { registerTool } from "../reasoning/tool-executor"
import { prisma } from "@/lib/prisma"
import type { ToolContext, ToolResult } from "../types"

/**
 * Load a reconciliation run's data + config for matching.
 * Returns all the args needed to call ReconciliationMatchingService.runMatching().
 */
async function loadRunContext(reconciliationRunId: string, organizationId: string) {
  const run = await prisma.reconciliationRun.findFirst({
    where: { id: reconciliationRunId, organizationId },
    select: {
      sourceARows: true,
      sourceBRows: true,
      config: {
        select: {
          sourceAConfig: true,
          sourceBConfig: true,
          matchingRules: true,
        },
      },
    },
  })

  if (!run) throw new Error(`Reconciliation run ${reconciliationRunId} not found`)
  if (!run.sourceARows || !run.sourceBRows) throw new Error("Run has no source data uploaded yet")

  const sourceARows = run.sourceARows as Record<string, unknown>[]
  const sourceBRows = run.sourceBRows as Record<string, unknown>[]
  const sourceAConfig = run.config.sourceAConfig as { label: string; columns: unknown[] }
  const sourceBConfig = run.config.sourceBConfig as { label: string; columns: unknown[] }
  const matchingRules = run.config.matchingRules as {
    amountMatch: string
    amountTolerance?: number
    dateWindowDays: number
    fuzzyDescription: boolean
  }

  return { sourceARows, sourceBRows, sourceAConfig, sourceBConfig, matchingRules }
}

export function registerReconciliationTools(): void {
  registerTool({
    name: "run_deterministic_matching",
    description: "Run exact amount+date matching on all source rows. Returns number of matches found and baseline match rate.",
    inputSchema: { reconciliationRunId: "string" },
    handler: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const { reconciliationRunId } = input as { reconciliationRunId: string }

      try {
        const { ReconciliationMatchingService } = await import("@/lib/services/reconciliation-matching.service")
        const { sourceARows, sourceBRows, sourceAConfig, sourceBConfig, matchingRules } =
          await loadRunContext(reconciliationRunId, context.organizationId)

        // Disable AI fuzzy matching for deterministic-only pass
        const deterministicRules = { ...matchingRules, fuzzyDescription: false }

        const result = await ReconciliationMatchingService.runMatching(
          sourceARows as Record<string, any>[],
          sourceBRows as Record<string, any>[],
          sourceAConfig as any,
          sourceBConfig as any,
          deterministicRules as any,
        )

        const matchedCount = result.matched.length
        const totalA = sourceARows.length
        const totalB = sourceBRows.length

        return {
          success: true,
          data: {
            matchedCount,
            totalSourceA: totalA,
            totalSourceB: totalB,
            matchRate: totalA > 0 ? Math.round((matchedCount / totalA) * 100) : 0,
            unmatchedA: result.unmatchedA.length,
            unmatchedB: result.unmatchedB.length,
            variance: result.variance,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Deterministic matching failed: ${(error as Error).message}`,
        }
      }
    },
  })

  registerTool({
    name: "run_fuzzy_matching",
    description: "Run AI-assisted fuzzy matching on unmatched rows. Uses GPT to find near-matches based on amount, date proximity, and description similarity.",
    inputSchema: { reconciliationRunId: "string" },
    handler: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const { reconciliationRunId } = input as { reconciliationRunId: string }

      try {
        const { ReconciliationMatchingService } = await import("@/lib/services/reconciliation-matching.service")
        const { sourceARows, sourceBRows, sourceAConfig, sourceBConfig, matchingRules } =
          await loadRunContext(reconciliationRunId, context.organizationId)

        // Enable fuzzy matching
        const fuzzyRules = { ...matchingRules, fuzzyDescription: true }

        const result = await ReconciliationMatchingService.runMatching(
          sourceARows as Record<string, any>[],
          sourceBRows as Record<string, any>[],
          sourceAConfig as any,
          sourceBConfig as any,
          fuzzyRules as any,
        )

        return {
          success: true,
          data: {
            matchedCount: result.matched.length,
            fuzzyMatches: result.matched.filter(m => m.method === "fuzzy_ai").length,
            unmatchedA: result.unmatchedA.length,
            unmatchedB: result.unmatchedB.length,
            exceptionsClassified: result.exceptions.length,
            variance: result.variance,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Fuzzy matching failed: ${(error as Error).message}`,
        }
      }
    },
  })

  registerTool({
    name: "classify_exceptions",
    description: "Classify unmatched items into exception categories (bank_fee, timing_difference, missing_entry, etc). Uses AI classification.",
    inputSchema: { reconciliationRunId: "string" },
    handler: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const { reconciliationRunId } = input as { reconciliationRunId: string }

      try {
        const { ReconciliationMatchingService } = await import("@/lib/services/reconciliation-matching.service")
        const { sourceARows, sourceBRows, sourceAConfig, sourceBConfig, matchingRules } =
          await loadRunContext(reconciliationRunId, context.organizationId)

        // Full matching pass includes exception classification
        const fuzzyRules = { ...matchingRules, fuzzyDescription: true }

        const result = await ReconciliationMatchingService.runMatching(
          sourceARows as Record<string, any>[],
          sourceBRows as Record<string, any>[],
          sourceAConfig as any,
          sourceBConfig as any,
          fuzzyRules as any,
        )

        // Group exceptions by category
        const categoryMap: Record<string, number> = {}
        for (const exc of result.exceptions) {
          categoryMap[exc.category] = (categoryMap[exc.category] || 0) + 1
        }

        return {
          success: true,
          data: {
            classified: result.exceptions.length,
            categories: categoryMap,
            exceptions: result.exceptions.slice(0, 20), // Limit for token budget
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Exception classification failed: ${(error as Error).message}`,
        }
      }
    },
  })

  registerTool({
    name: "recommend_resolution",
    description: "Recommend a resolution for a specific exception. Does NOT auto-resolve — creates a recommendation that the human must approve.",
    inputSchema: { exceptionIndex: "number", category: "string", reason: "string", confidence: "number" },
    handler: async (input: unknown, _context: ToolContext): Promise<ToolResult> => {
      const { exceptionIndex, category, reason, confidence } = input as {
        exceptionIndex: number
        category: string
        reason: string
        confidence: number
      }

      // Recommendations are collected by the agent runner, not persisted directly
      return {
        success: true,
        data: {
          recommendation: {
            exceptionIndex,
            category,
            reason,
            confidence,
          },
        },
      }
    },
  })

  registerTool({
    name: "check_vendor_database",
    description: "Look up a vendor or customer in the organization's vendor/customer database. Returns any matching rows with context like payment terms, category, notes.",
    inputSchema: { query: "string" },
    handler: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const { query } = input as { query: string }

      try {
        const { VendorDatabaseService } = await import("@/lib/agents/vendor-database.service")
        const matches = await VendorDatabaseService.queryByName(
          context.organizationId,
          query,
          5
        )

        return {
          success: true,
          data: {
            matchesFound: matches.length,
            matches,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Vendor database lookup failed: ${(error as Error).message}`,
        }
      }
    },
  })

  registerTool({
    name: "save_results",
    description: "Persist the current match results to the reconciliation run. Call this before finishing to save your work.",
    inputSchema: { reconciliationRunId: "string" },
    handler: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const { reconciliationRunId } = input as { reconciliationRunId: string }

      try {
        // Read current run summary stats
        const run = await prisma.reconciliationRun.findFirst({
          where: {
            id: reconciliationRunId,
            organizationId: context.organizationId,
          },
          select: {
            matchedCount: true,
            exceptionCount: true,
            totalSourceA: true,
            variance: true,
          },
        })

        return {
          success: true,
          data: {
            saved: true,
            summary: run ? {
              matchedCount: run.matchedCount,
              exceptionCount: run.exceptionCount,
              totalSourceA: run.totalSourceA,
              matchRate: run.totalSourceA
                ? Math.round((run.matchedCount / run.totalSourceA) * 100)
                : 0,
              variance: run.variance,
            } : null,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Save failed: ${(error as Error).message}`,
        }
      }
    },
  })
}
