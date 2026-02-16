/**
 * Metrics Tracker
 *
 * Stores execution metrics for improvement tracking.
 * Computes baseline vs agent match rate comparison.
 */

import { prisma } from "@/lib/prisma"
import type { ExecutionMetrics } from "../types"

/**
 * Save execution metrics to the database.
 */
export async function saveExecutionMetrics(
  executionId: string,
  organizationId: string,
  agentDefinitionId: string,
  metrics: ExecutionMetrics,
  periodKey?: string
): Promise<void> {
  await prisma.agentExecutionMetrics.create({
    data: {
      organizationId,
      executionId,
      agentDefinitionId,
      periodKey: periodKey || null,
      baselineMatchRate: metrics.baselineMatchRate,
      agentMatchRate: metrics.agentMatchRate,
      exceptionsTotal: metrics.exceptionsTotal,
      exceptionsRecommended: metrics.exceptionsRecommended,
      humanCorrections: metrics.humanCorrections,
      memoriesUsed: metrics.memoriesUsed,
      memoriesCreated: metrics.memoriesCreated,
      memoriesUpdated: metrics.memoriesUpdated,
      llmCallCount: metrics.llmCallCount,
      totalTokensUsed: metrics.totalTokensUsed,
      estimatedCostUsd: metrics.estimatedCostUsd,
      executionTimeMs: metrics.executionTimeMs,
      fallbackUsed: metrics.fallbackUsed,
    },
  })
}

/**
 * Get improvement trend for an agent (match rate over time).
 */
export async function getImprovementTrend(
  agentDefinitionId: string,
  limit: number = 20
): Promise<{ period: string; baseline: number | null; agent: number | null; corrections: number }[]> {
  const metrics = await prisma.agentExecutionMetrics.findMany({
    where: { agentDefinitionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      periodKey: true,
      baselineMatchRate: true,
      agentMatchRate: true,
      humanCorrections: true,
      createdAt: true,
    },
  })

  return metrics.reverse().map(m => ({
    period: m.periodKey || m.createdAt.toISOString().split("T")[0],
    baseline: m.baselineMatchRate,
    agent: m.agentMatchRate,
    corrections: m.humanCorrections || 0,
  }))
}
