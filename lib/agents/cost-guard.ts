/**
 * Agent Cost Guard
 *
 * Per-execution and per-organization daily cost ceilings.
 * Checked before each LLM call — aborts reasoning loop if exceeded.
 */

import { prisma } from "@/lib/prisma"
import type { CostBudget } from "./types"

const DEFAULT_MAX_COST_PER_EXECUTION = 2.0  // USD
const DEFAULT_MAX_TOKENS_PER_EXECUTION = 500_000
const DEFAULT_MAX_COST_PER_ORG_DAILY = 50.0 // USD

export class CostGuard {
  private budget: CostBudget

  constructor(
    private organizationId: string,
    private executionId: string,
    overrides?: Partial<CostBudget>
  ) {
    this.budget = {
      maxTokensPerExecution: overrides?.maxTokensPerExecution ?? DEFAULT_MAX_TOKENS_PER_EXECUTION,
      maxCostPerExecution: overrides?.maxCostPerExecution ?? DEFAULT_MAX_COST_PER_EXECUTION,
      maxCostPerOrgDaily: overrides?.maxCostPerOrgDaily ?? DEFAULT_MAX_COST_PER_ORG_DAILY,
      currentTokensUsed: 0,
      currentCostUsed: 0,
    }
  }

  /**
   * Record tokens and cost from an LLM call.
   */
  record(tokensUsed: number, costUsd: number): void {
    this.budget.currentTokensUsed += tokensUsed
    this.budget.currentCostUsed += costUsd
  }

  /**
   * Check if the execution is within budget.
   * Returns null if OK, or a reason string if budget exceeded.
   */
  async check(): Promise<string | null> {
    // Check per-execution token limit
    if (this.budget.currentTokensUsed >= this.budget.maxTokensPerExecution) {
      return `Token budget exceeded: ${this.budget.currentTokensUsed} / ${this.budget.maxTokensPerExecution}`
    }

    // Check per-execution cost limit
    if (this.budget.currentCostUsed >= this.budget.maxCostPerExecution) {
      return `Cost budget exceeded: $${this.budget.currentCostUsed.toFixed(2)} / $${this.budget.maxCostPerExecution.toFixed(2)}`
    }

    // Check daily org-wide cost
    const dailyCost = await this.getOrgDailyCost()
    if (dailyCost >= this.budget.maxCostPerOrgDaily) {
      return `Daily org cost limit exceeded: $${dailyCost.toFixed(2)} / $${this.budget.maxCostPerOrgDaily.toFixed(2)}`
    }

    return null
  }

  /**
   * Get current totals for the execution.
   */
  getCurrentUsage(): { tokensUsed: number; costUsed: number } {
    return {
      tokensUsed: this.budget.currentTokensUsed,
      costUsed: this.budget.currentCostUsed,
    }
  }

  private async getOrgDailyCost(): Promise<number> {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const result = await prisma.agentExecution.aggregate({
      where: {
        organizationId: this.organizationId,
        createdAt: { gte: todayStart },
      },
      _sum: { estimatedCostUsd: true },
    })

    return (result._sum.estimatedCostUsd || 0) + this.budget.currentCostUsed
  }
}
