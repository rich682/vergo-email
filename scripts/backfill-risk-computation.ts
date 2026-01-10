/**
 * Backfill Script: Compute risk levels for existing tasks with replies or opens
 * 
 * This script processes all tasks that have:
 * - Inbound messages (replies) but missing riskLevel/riskReason
 * - Outbound messages with openedAt (opens) but missing readStatus/riskLevel
 * 
 * It uses the same risk computation logic as the real-time pipeline:
 * - LLM-based risk computation for tasks with replies (using request context)
 * - Deterministic risk computation for tasks with just opens
 * - Respects manual overrides (skips tasks with manualRiskOverride)
 */

import { prisma } from "../lib/prisma"
import { computeRiskWithLLM, computeDeterministicRisk, computeLastActivityAt } from "../lib/services/risk-computation.service"
import { AIClassificationService } from "../lib/services/ai-classification.service"

async function backfillRiskComputation() {
  console.log("[Risk Backfill] Starting backfill of risk levels for existing tasks...")

  try {
    // Find all tasks that need risk computation:
    // 1. Tasks with replies but missing riskLevel OR readStatus
    // 2. Tasks with opens but missing readStatus OR riskLevel
    // 3. Skip tasks with manual overrides (they already have manual risk set)
    const tasksNeedingRisk = await prisma.task.findMany({
      where: {
        manualRiskOverride: null, // Skip manually overridden tasks
        OR: [
          {
            // Has replies but missing risk data
            messages: {
              some: {
                direction: "INBOUND"
              }
            },
            OR: [
              { riskLevel: null },
              { readStatus: null }
            ]
          },
          {
            // Has opens but missing risk data
            messages: {
              some: {
                direction: "OUTBOUND",
                openedAt: { not: null }
              }
            },
            OR: [
              { riskLevel: null },
              { readStatus: null }
            ]
          }
        ]
      },
      include: {
        entity: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10 // Get recent messages for context
        }
      }
    })

    console.log(`[Risk Backfill] Found ${tasksNeedingRisk.length} tasks that need risk computation`)

    let processed = 0
    let errors = 0
    let skipped = 0

    for (const task of tasksNeedingRisk) {
      try {
        // Check if manual override was set after we fetched (race condition check)
        const currentTask = await prisma.task.findUnique({
          where: { id: task.id },
          select: { manualRiskOverride: true }
        })

        if (currentTask?.manualRiskOverride) {
          console.log(`[Risk Backfill] Skipping task ${task.id} - has manual override`)
          skipped++
          continue
        }

        // Get latest inbound message (reply)
        const latestInboundMessage = task.messages
          .filter(m => m.direction === "INBOUND")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        // Get latest outbound message (request)
        const latestOutboundMessage = task.messages
          .filter(m => m.direction === "OUTBOUND")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        if (!latestOutboundMessage) {
          console.log(`[Risk Backfill] Skipping task ${task.id} - no outbound message found`)
          skipped++
          continue
        }

        const hasReplies = !!latestInboundMessage
        const openedAt = latestOutboundMessage.openedAt
        const lastOpenedAt = latestOutboundMessage.lastOpenedAt

        // Classify reply if it exists and not already classified
        let classification: string | null = null
        if (latestInboundMessage && !latestInboundMessage.aiClassification) {
          console.log(`[Risk Backfill] Classifying message ${latestInboundMessage.id} for task ${task.id}...`)
          try {
            const classificationResult = await AIClassificationService.classifyMessage({
              subject: latestInboundMessage.subject || undefined,
              body: latestInboundMessage.body || ""
            })
            classification = classificationResult.classification

            // Update message with classification
            await prisma.message.update({
              where: { id: latestInboundMessage.id },
              data: {
                aiClassification: classification,
                aiReasoning: classificationResult.reasoning
              }
            })
          } catch (classifyError: any) {
            console.warn(`[Risk Backfill] Failed to classify message ${latestInboundMessage.id}:`, classifyError.message)
            // Continue without classification
          }
        } else if (latestInboundMessage) {
          classification = latestInboundMessage.aiClassification
        }

        // Build request context
        const requestSubject = latestOutboundMessage.subject || task.campaignName || "Request"
        const requestBody = latestOutboundMessage.body || latestOutboundMessage.htmlBody || ""
        const requestPrompt = task.campaignName || null
        const replyText = latestInboundMessage?.body || latestInboundMessage?.htmlBody || null

        let riskResult

        if (hasReplies && replyText) {
          // Use LLM-based risk computation for tasks with replies
          console.log(`[Risk Backfill] Computing LLM-based risk for task ${task.id} (has reply)...`)
          
          try {
            riskResult = await computeRiskWithLLM({
              hasReplies: true,
              latestResponseText: replyText,
              latestInboundClassification: classification,
              completionPercentage: task.completionPercentage,
              openedAt: openedAt,
              lastOpenedAt: lastOpenedAt,
              hasAttachments: task.hasAttachments,
              aiVerified: task.aiVerified,
              lastActivityAt: latestInboundMessage?.createdAt || task.lastActivityAt || task.updatedAt,
              deadlineDate: task.deadlineDate || null,
              requestSubject: requestSubject,
              requestBody: requestBody,
              requestPrompt: requestPrompt,
              replyText: replyText
            })
          } catch (llmError: any) {
            console.warn(`[Risk Backfill] LLM risk computation failed for task ${task.id}, using deterministic fallback:`, llmError.message)
            // Fall back to deterministic
            riskResult = computeDeterministicRisk({
              hasReplies: true,
              latestResponseText: replyText,
              latestInboundClassification: classification,
              completionPercentage: task.completionPercentage,
              openedAt: openedAt,
              lastOpenedAt: lastOpenedAt,
              hasAttachments: task.hasAttachments,
              aiVerified: task.aiVerified,
              lastActivityAt: latestInboundMessage?.createdAt || task.lastActivityAt || task.updatedAt,
              deadlineDate: task.deadlineDate || null
            })
          }
        } else {
          // Use deterministic risk computation for tasks with just opens (no replies)
          console.log(`[Risk Backfill] Computing deterministic risk for task ${task.id} (no reply, opened: ${!!openedAt})...`)
          
          riskResult = computeDeterministicRisk({
            hasReplies: false,
            latestResponseText: null,
            latestInboundClassification: null,
            completionPercentage: task.completionPercentage,
            openedAt: openedAt,
            lastOpenedAt: lastOpenedAt,
            hasAttachments: task.hasAttachments,
            aiVerified: task.aiVerified,
            lastActivityAt: lastOpenedAt || openedAt || task.lastActivityAt || task.updatedAt,
            deadlineDate: task.deadlineDate || null
          })
        }

        // Compute lastActivityAt
        const lastActivityAt = computeLastActivityAt({
          lastOpenedAt: lastOpenedAt,
          openedAt: openedAt,
          lastActivityAt: latestInboundMessage?.createdAt || task.lastActivityAt || task.updatedAt
        }) || latestInboundMessage?.createdAt || lastOpenedAt || openedAt || task.updatedAt

        // Update task with risk computation
        await prisma.task.update({
          where: { id: task.id },
          data: {
            readStatus: riskResult.readStatus,
            riskLevel: riskResult.riskLevel,
            riskReason: riskResult.riskReason,
            lastActivityAt: lastActivityAt
          }
        })

        console.log(`[Risk Backfill] ✓ Task ${task.id}: ${riskResult.riskLevel} risk (${riskResult.readStatus}) - ${riskResult.riskReason}`)
        processed++

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error: any) {
        console.error(`[Risk Backfill] ✗ Error processing task ${task.id}:`, error.message)
        errors++
      }
    }

    console.log(`\n[Risk Backfill] Backfill complete!`)
    console.log(`- Processed: ${processed}`)
    console.log(`- Skipped: ${skipped}`)
    console.log(`- Errors: ${errors}`)
    console.log(`- Total: ${tasksNeedingRisk.length}`)

    return { processed, skipped, errors, total: tasksNeedingRisk.length }
  } catch (error: any) {
    console.error("[Risk Backfill] Fatal error during backfill:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the backfill
if (require.main === module) {
  backfillRiskComputation()
    .then((result) => {
      console.log("[Risk Backfill] Backfill script completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      console.error("[Risk Backfill] Backfill script failed:", error)
      process.exit(1)
    })
}

export { backfillRiskComputation }

