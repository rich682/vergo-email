/**
 * Agent Runner — Inngest Function
 *
 * Core reasoning loop with deterministic fallback.
 * Uses step.run() for durability — crash-resumable.
 *
 * Event: "agent/run"
 * Data: { agentDefinitionId, organizationId, triggeredBy, reconciliationRunId? }
 */

import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import { AgentExecutionService } from "@/lib/agents/agent-execution.service"
import { CostGuard } from "@/lib/agents/cost-guard"
import { AgentLogger } from "@/lib/agents/agent-logger"
import { retrieveMemories } from "@/lib/agents/memory/memory-retriever"
import { makeReasoningDecision } from "@/lib/agents/reasoning/agent-reasoning.service"
import { executeTool } from "@/lib/agents/reasoning/tool-executor"
import { registerReconciliationTools } from "@/lib/agents/tools/reconciliation-tools"
import { registerBaseTools } from "@/lib/agents/tools/base-tools"
import { RECONCILIATION_SYSTEM_PROMPT, RECON_PROMPT_VERSION } from "@/lib/agents/prompts/reconciliation-system"
import { distillLessons } from "@/lib/agents/learning/agent-learning.service"
import { saveExecutionMetrics } from "@/lib/agents/learning/metrics-tracker"
import type {
  ToolContext,
  AgentRecommendation,
  ExecutionOutcome,
} from "@/lib/agents/types"

const MAX_ITERATIONS = 10

export const agentRunner = inngest.createFunction(
  {
    id: "agent-run",
    name: "Run AI Agent",
    retries: 0, // No retries — deterministic fallback handles failures
  },
  { event: "agent/run" },
  async ({ event, step }) => {
    const {
      agentDefinitionId,
      organizationId,
      triggeredBy,
      reconciliationRunId,
    } = event.data

    // ── Step 1: Load agent definition ──────────────────────────────────
    const agent = await step.run("load-agent", async () => {
      const agentDef = await prisma.agentDefinition.findFirst({
        where: { id: agentDefinitionId, organizationId },
      })
      if (!agentDef) throw new Error(`Agent ${agentDefinitionId} not found`)
      if (!agentDef.isActive) throw new Error(`Agent ${agentDefinitionId} is inactive`)
      return {
        id: agentDef.id,
        taskType: agentDef.taskType,
        name: agentDef.name,
        configId: agentDef.configId,
        settings: agentDef.settings as Record<string, unknown>,
      }
    })

    // ── Step 2: Create execution record ────────────────────────────────
    const execution = await step.run("create-execution", async () => {
      return AgentExecutionService.create({
        organizationId,
        agentDefinitionId,
        triggerType: triggeredBy ? "manual" : "event",
        triggeredBy,
        goal: `Reconciliation agent run for config ${agent.configId || "unknown"}`,
        inputContext: { reconciliationRunId, taskType: agent.taskType },
        promptVersion: RECON_PROMPT_VERSION,
      })
    })

    const executionId = execution.id
    const startTime = Date.now()

    // ── Step 3: Initialize tools, memory, cost guard ───────────────────
    const memories = await step.run("load-context", async () => {
      // Register tools
      registerReconciliationTools()
      registerBaseTools()

      // Extract entity keys from reconciliation data for memory matching
      let entityKeys: string[] = []
      if (reconciliationRunId) {
        const run = await prisma.reconciliationRun.findUnique({
          where: { id: reconciliationRunId },
          select: { sourceARows: true, sourceBRows: true },
        })
        if (run) {
          const sourceARows = (run.sourceARows || []) as Array<Record<string, unknown>>
          const sourceBRows = (run.sourceBRows || []) as Array<Record<string, unknown>>
          // Extract unique descriptions/names for entity matching
          const descriptions = new Set<string>()
          for (const row of [...sourceARows.slice(0, 50), ...sourceBRows.slice(0, 50)]) {
            if (row.description) descriptions.add(String(row.description))
            if (row.name) descriptions.add(String(row.name))
            if (row.vendor) descriptions.add(String(row.vendor))
          }
          entityKeys = Array.from(descriptions).slice(0, 30)
        }
      }

      // Retrieve memories
      const retrieved = await retrieveMemories({
        organizationId,
        agentDefinitionId,
        entityKeys,
        maxMemories: 20,
        confidenceFloor: 0.5,
      })

      return retrieved
    })

    // ── Step 4: Reasoning loop ─────────────────────────────────────────
    const result = await step.run("reasoning-loop", async () => {
      const costGuard = new CostGuard(organizationId, executionId)
      const logger = new AgentLogger(executionId)

      const toolContext: ToolContext = {
        organizationId,
        agentDefinitionId,
        executionId,
        reconciliationConfigId: agent.configId || undefined,
        reconciliationRunId: reconciliationRunId || undefined,
      }

      const recommendations: AgentRecommendation[] = []
      const toolCallHistory: string[] = []
      let currentState = "Starting reconciliation run. No matching has been performed yet."
      let finalOutcome: ExecutionOutcome | null = null

      try {
        for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
          // Check cancellation
          const cancelled = await AgentExecutionService.isCancelled(executionId)
          if (cancelled) {
            await logger.logStep({
              reasoning: "Execution was cancelled by user.",
              action: "cancelled",
              toolName: null,
              toolInput: null,
              toolOutput: null,
              status: "skipped",
            })
            return {
              status: "cancelled" as const,
              outcome: { summary: "Execution cancelled by user." } as ExecutionOutcome,
              recommendations,
              costGuard: costGuard.getCurrentUsage(),
              steps: logger.getSteps(),
            }
          }

          // Check cost budget
          const budgetExceeded = await costGuard.check()
          if (budgetExceeded) {
            console.warn(`[Agent Runner] Budget exceeded: ${budgetExceeded}`)
            await logger.logStep({
              reasoning: `Budget exceeded: ${budgetExceeded}. Falling back to deterministic matching.`,
              action: "budget_exceeded",
              toolName: null,
              toolInput: null,
              toolOutput: null,
              status: "skipped",
            })
            throw new Error(`BUDGET_EXCEEDED: ${budgetExceeded}`)
          }

          // Make reasoning decision
          const { decision, tokensUsed, model, durationMs, cost } = await makeReasoningDecision({
            systemPrompt: RECONCILIATION_SYSTEM_PROMPT,
            goal: `Reconcile data for reconciliation run ${reconciliationRunId}. Find matches, classify exceptions, and recommend resolutions based on your memory.`,
            currentState,
            memories,
            previousSteps: logger.getSteps(),
            iteration,
            totalRows: 200, // Approximate — we don't know exact count yet
            customInstructions: (agent.settings as any)?.customInstructions,
          })

          costGuard.record(tokensUsed, cost)

          // Check for tool call deduplication
          if (decision.toolName && decision.toolInput) {
            const callKey = `${decision.toolName}:${JSON.stringify(decision.toolInput)}`
            if (toolCallHistory.includes(callKey)) {
              await logger.logStep({
                reasoning: `Duplicate tool call detected (${decision.toolName}). Skipping to avoid infinite loop.`,
                action: "deduplicated",
                toolName: decision.toolName,
                toolInput: decision.toolInput,
                toolOutput: null,
                status: "skipped",
              })
              // Force the agent to finish
              break
            }
            toolCallHistory.push(callKey)
          }

          // Agent is done
          if (decision.done) {
            await logger.logStep({
              reasoning: decision.reasoning,
              action: decision.action || "done",
              toolName: null,
              toolInput: null,
              toolOutput: null,
              status: "completed",
              model,
              tokensUsed,
              durationMs,
            })

            finalOutcome = {
              summary: decision.reasoning,
              recommended: recommendations.length,
              flaggedForReview: decision.needsHuman ? 1 : 0,
            }
            break
          }

          // Agent needs human review
          if (decision.needsHuman) {
            await logger.logStep({
              reasoning: decision.reasoning,
              action: "needs_human_review",
              toolName: null,
              toolInput: null,
              toolOutput: { message: decision.humanMessage },
              status: "completed",
              model,
              tokensUsed,
              durationMs,
            })

            return {
              status: "needs_review" as const,
              outcome: {
                summary: decision.humanMessage || decision.reasoning,
                recommended: recommendations.length,
                flaggedForReview: 1,
              } as ExecutionOutcome,
              recommendations,
              costGuard: costGuard.getCurrentUsage(),
              steps: logger.getSteps(),
            }
          }

          // Execute tool
          if (decision.toolName) {
            const toolResult = await executeTool(
              decision.toolName,
              decision.toolInput,
              toolContext
            )

            // Track token cost from tools that make LLM calls
            if (toolResult.tokensUsed) {
              costGuard.record(toolResult.tokensUsed, 0)
            }

            // Collect recommendations
            if (decision.toolName === "recommend_resolution" && toolResult.success) {
              const rec = (toolResult.data as { recommendation?: AgentRecommendation })?.recommendation
              if (rec) recommendations.push(rec)
            }

            await logger.logStep({
              reasoning: decision.reasoning,
              action: decision.action,
              toolName: decision.toolName,
              toolInput: decision.toolInput,
              toolOutput: toolResult.data || toolResult.error,
              status: toolResult.success ? "completed" : "failed",
              model,
              tokensUsed,
              durationMs: durationMs + (toolResult.durationMs || 0),
            })

            // Update current state based on tool output
            if (toolResult.success && toolResult.data) {
              currentState = `Last action: ${decision.action}. Result: ${JSON.stringify(toolResult.data).substring(0, 500)}`
            }
          }
        }

        // Determine final outcome from steps if not set
        if (!finalOutcome) {
          finalOutcome = {
            summary: "Agent completed maximum iterations.",
            recommended: recommendations.length,
          }
        }

        return {
          status: "completed" as const,
          outcome: finalOutcome,
          recommendations,
          costGuard: costGuard.getCurrentUsage(),
          steps: logger.getSteps(),
        }
      } catch (error) {
        // ── Deterministic fallback ───────────────────────────────────
        console.error("[Agent Runner] Reasoning loop failed, falling back to deterministic:", error)

        let fallbackMatchedCount: number | null = null
        let fallbackTotalA: number | null = null
        if (reconciliationRunId) {
          try {
            // Load run data + config to call matching service with correct args
            const run = await prisma.reconciliationRun.findUnique({
              where: { id: reconciliationRunId },
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

            if (run?.sourceARows && run?.sourceBRows) {
              const { ReconciliationMatchingService } = await import(
                "@/lib/services/reconciliation-matching.service"
              )
              const sourceARows = run.sourceARows as Record<string, any>[]
              const sourceBRows = run.sourceBRows as Record<string, any>[]

              const fallbackResult = await ReconciliationMatchingService.runMatching(
                sourceARows,
                sourceBRows,
                run.config.sourceAConfig as any,
                run.config.sourceBConfig as any,
                run.config.matchingRules as any,
              )
              fallbackMatchedCount = fallbackResult.matched.length
              fallbackTotalA = sourceARows.length
            }
          } catch (fallbackError) {
            console.error("[Agent Runner] Deterministic fallback also failed:", fallbackError)
          }
        }

        await logger.logStep({
          reasoning: `Agent reasoning failed: ${(error as Error).message}. ${fallbackMatchedCount !== null ? "Deterministic matching was used as fallback." : "Fallback also failed."}`,
          action: "deterministic_fallback",
          toolName: null,
          toolInput: null,
          toolOutput: fallbackMatchedCount !== null ? { fallback: true, matchedCount: fallbackMatchedCount } : null,
          status: fallbackMatchedCount !== null ? "completed" : "failed",
        })

        return {
          status: "failed" as const,
          outcome: {
            summary: `Agent failed: ${(error as Error).message}. ${fallbackMatchedCount !== null ? "Deterministic matching completed as fallback." : ""}`,
            matchedCount: fallbackMatchedCount ?? undefined,
            matchRate: fallbackTotalA && fallbackMatchedCount !== null
              ? Math.round((fallbackMatchedCount / fallbackTotalA) * 100)
              : undefined,
          } as ExecutionOutcome,
          recommendations,
          costGuard: costGuard.getCurrentUsage(),
          steps: logger.getSteps(),
          fallback: {
            used: true,
            reason: (error as Error).message,
          },
        }
      }
    })

    // ── Step 5: Finalize execution ─────────────────────────────────────
    await step.run("finalize", async () => {
      const executionTimeMs = Date.now() - startTime

      if (result.status === "completed") {
        await AgentExecutionService.complete(executionId, result.outcome!, {
          estimatedCostUsd: result.costGuard.costUsed,
          executionTimeMs,
          totalTokensUsed: result.costGuard.tokensUsed,
        })
      } else if (result.status === "needs_review") {
        await AgentExecutionService.markNeedsReview(executionId, result.outcome!)
      } else if (result.status === "cancelled") {
        await AgentExecutionService.cancel(executionId)
      } else {
        await AgentExecutionService.fail(executionId, result.outcome?.summary || "Agent failed", result.fallback)
      }

      // Persist steps to execution
      await prisma.agentExecution.update({
        where: { id: executionId },
        data: {
          steps: result.steps as any,
          outcome: (result.outcome || {}) as any,
          estimatedCostUsd: result.costGuard.costUsed,
          totalTokensUsed: result.costGuard.tokensUsed,
          executionTimeMs,
        },
      })
    })

    // ── Step 6: Post-execution learning ────────────────────────────────
    if (result.status === "completed" || result.status === "needs_review") {
      await step.run("learn", async () => {
        try {
          // Distill lessons from execution
          const lessons = await distillLessons(
            organizationId,
            agentDefinitionId,
            result.steps,
            result.recommendations
          )

          // Save metrics — 5 positional args
          await saveExecutionMetrics(
            executionId,
            organizationId,
            agentDefinitionId,
            {
              baselineMatchRate: null,
              agentMatchRate: result.outcome?.matchRate ?? null,
              exceptionsTotal: result.outcome?.exceptionCount ?? 0,
              exceptionsRecommended: result.recommendations.length,
              humanCorrections: 0, // Filled in by feedback capture later
              memoriesUsed: memories.length,
              memoriesCreated: lessons.lessonsCreated,
              memoriesUpdated: lessons.lessonsUpdated,
              llmCallCount: 0,
              totalTokensUsed: result.costGuard.tokensUsed,
              estimatedCostUsd: result.costGuard.costUsed,
              executionTimeMs: Date.now() - startTime,
              fallbackUsed: false,
            }
          )

          console.log(`[Agent Runner] Learning complete: ${lessons.lessonsCreated} created, ${lessons.lessonsUpdated} updated`)
        } catch (error) {
          console.error("[Agent Runner] Post-execution learning failed:", error)
          // Learning failure is non-critical — don't fail the execution
        }
      })
    }

    return {
      executionId,
      status: result.status,
      outcome: result.outcome,
      recommendations: result.recommendations.length,
    }
  }
)
