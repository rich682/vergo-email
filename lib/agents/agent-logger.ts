/**
 * Agent Logger
 *
 * Structured JSON logging for agent execution steps.
 * Each step is persisted to AgentExecution.steps array.
 */

import { prisma } from "@/lib/prisma"
import type { ExecutionStep } from "./types"

export class AgentLogger {
  private steps: ExecutionStep[] = []

  constructor(
    private executionId: string,
    private agentName: string = "Agent"
  ) {}

  /**
   * Log a completed step and persist to DB.
   */
  async logStep(step: Omit<ExecutionStep, "stepNumber" | "timestamp">): Promise<void> {
    const executionStep: ExecutionStep = {
      stepNumber: this.steps.length + 1,
      timestamp: new Date().toISOString(),
      ...step,
    }

    this.steps.push(executionStep)

    // Persist to DB (update steps JSON array)
    await prisma.agentExecution.update({
      where: { id: this.executionId },
      data: { steps: this.steps as any },
    })

    // Console log for observability
    const emoji = step.status === "completed" ? "✅" : step.status === "failed" ? "❌" : "⏭️"
    console.log(
      `[Agent ${this.agentName}] ${emoji} Step ${executionStep.stepNumber}: ${step.action}` +
      (step.toolName ? ` (tool: ${step.toolName})` : "") +
      (step.model ? ` [${step.model}]` : "") +
      (step.tokensUsed ? ` ${step.tokensUsed} tokens` : "")
    )
  }

  /**
   * Get all logged steps.
   */
  getSteps(): ExecutionStep[] {
    return [...this.steps]
  }

  /**
   * Get a compact summary of steps for inclusion in the next LLM prompt.
   */
  getHistorySummary(maxSteps: number = 10): string {
    const recentSteps = this.steps.slice(-maxSteps)
    return recentSteps
      .map(s => `Step ${s.stepNumber} [${s.status}]: ${s.action}${s.toolName ? ` → ${s.toolName}` : ""}`)
      .join("\n")
  }
}
