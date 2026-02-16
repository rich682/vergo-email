/**
 * Agent Execution Service
 *
 * Manages execution lifecycle: create, update steps, complete, fail, cancel.
 */

import { prisma } from "@/lib/prisma"
import type {
  AgentExecutionStatus,
  AgentTriggerType,
  ExecutionStep,
  ExecutionOutcome,
} from "./types"

interface CreateExecutionInput {
  organizationId: string
  agentDefinitionId: string
  triggerType: AgentTriggerType
  triggeredBy?: string
  goal: string
  inputContext?: Record<string, unknown>
  promptVersion?: string
}

export class AgentExecutionService {
  /**
   * Create a new execution record.
   */
  static async create(input: CreateExecutionInput) {
    return prisma.agentExecution.create({
      data: {
        organizationId: input.organizationId,
        agentDefinitionId: input.agentDefinitionId,
        triggerType: input.triggerType,
        triggeredBy: input.triggeredBy || null,
        goal: input.goal,
        inputContext: (input.inputContext || {}) as any,
        promptVersion: input.promptVersion || null,
        status: "running",
      },
    })
  }

  /**
   * Get execution by ID (with org scoping).
   */
  static async getById(id: string, organizationId: string) {
    return prisma.agentExecution.findFirst({
      where: { id, organizationId },
      include: {
        agentDefinition: {
          select: { id: true, name: true, taskType: true, configId: true },
        },
      },
    })
  }

  /**
   * List executions for an agent.
   */
  static async listForAgent(
    agentDefinitionId: string,
    organizationId: string,
    limit = 20
  ) {
    return prisma.agentExecution.findMany({
      where: { agentDefinitionId, organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        triggerType: true,
        goal: true,
        outcome: true,
        promptVersion: true,
        fallbackUsed: true,
        llmCallCount: true,
        totalTokensUsed: true,
        estimatedCostUsd: true,
        executionTimeMs: true,
        cancelled: true,
        completedAt: true,
        createdAt: true,
      },
    })
  }

  /**
   * Append a step to the execution's steps array.
   */
  static async appendStep(executionId: string, step: ExecutionStep) {
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: { steps: true, llmCallCount: true, totalTokensUsed: true, estimatedCostUsd: true },
    })

    if (!execution) return null

    const steps = (execution.steps as unknown as ExecutionStep[]) || []
    steps.push(step)

    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        steps: steps as any,
        llmCallCount: (execution.llmCallCount || 0) + (step.model ? 1 : 0),
        totalTokensUsed: (execution.totalTokensUsed || 0) + (step.tokensUsed || 0),
        estimatedCostUsd: (execution.estimatedCostUsd || 0) + (step.durationMs ? 0 : 0),
      },
    })
  }

  /**
   * Complete an execution with outcome.
   */
  static async complete(
    executionId: string,
    outcome: ExecutionOutcome,
    meta?: {
      estimatedCostUsd?: number
      executionTimeMs?: number
      llmCallCount?: number
      totalTokensUsed?: number
    }
  ) {
    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: "completed",
        outcome: outcome as any,
        completedAt: new Date(),
        ...(meta?.estimatedCostUsd !== undefined && {
          estimatedCostUsd: meta.estimatedCostUsd,
        }),
        ...(meta?.executionTimeMs !== undefined && {
          executionTimeMs: meta.executionTimeMs,
        }),
        ...(meta?.llmCallCount !== undefined && {
          llmCallCount: meta.llmCallCount,
        }),
        ...(meta?.totalTokensUsed !== undefined && {
          totalTokensUsed: meta.totalTokensUsed,
        }),
      },
    })
  }

  /**
   * Mark execution as needing human review.
   */
  static async markNeedsReview(executionId: string, outcome: ExecutionOutcome) {
    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: "needs_review",
        outcome: outcome as any,
        completedAt: new Date(),
      },
    })
  }

  /**
   * Fail an execution.
   */
  static async fail(
    executionId: string,
    reason: string,
    fallback?: { used: boolean; reason?: string }
  ) {
    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: "failed",
        completedAt: new Date(),
        outcome: { error: reason } as any,
        ...(fallback && {
          fallbackUsed: fallback.used,
          fallbackReason: fallback.reason || null,
        }),
      },
    })
  }

  /**
   * Cancel an execution.
   */
  static async cancel(executionId: string) {
    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        cancelled: true,
        status: "cancelled",
        completedAt: new Date(),
      },
    })
  }

  /**
   * Check if execution is cancelled (used in reasoning loop).
   */
  static async isCancelled(executionId: string): Promise<boolean> {
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: { cancelled: true },
    })
    return execution?.cancelled ?? false
  }

  /**
   * Get current status for polling.
   */
  static async getStatus(executionId: string, organizationId: string) {
    const execution = await prisma.agentExecution.findFirst({
      where: { id: executionId, organizationId },
      select: {
        id: true,
        status: true,
        cancelled: true,
        steps: true,
        outcome: true,
        llmCallCount: true,
        totalTokensUsed: true,
        estimatedCostUsd: true,
        executionTimeMs: true,
        completedAt: true,
        createdAt: true,
      },
    })

    if (!execution) return null

    const steps = (execution.steps as unknown as ExecutionStep[]) || []
    const currentStep = steps.length > 0 ? steps[steps.length - 1] : null

    return {
      ...execution,
      totalSteps: steps.length,
      currentStep: currentStep
        ? {
            stepNumber: currentStep.stepNumber,
            action: currentStep.action,
            reasoning: currentStep.reasoning,
            status: currentStep.status,
          }
        : null,
    }
  }

  /**
   * Update cost tracking on execution.
   */
  static async updateCosts(
    executionId: string,
    costs: { tokensUsed: number; costUsd: number }
  ) {
    return prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        totalTokensUsed: { increment: costs.tokensUsed },
        estimatedCostUsd: { increment: costs.costUsd },
        llmCallCount: { increment: 1 },
      },
    })
  }
}
