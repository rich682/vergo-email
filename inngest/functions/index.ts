import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import { AIClassificationService } from "@/lib/services/ai-classification.service"
import { EmailSyncService } from "@/lib/services/email-sync.service"
import OpenAI from "openai"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

export const functions = [
  inngest.createFunction(
    { id: "ping" },
    { event: "app/ping" },
    async () => {
      return { ok: true }
    }
  ),
  inngest.createFunction(
    { id: "classify-message" },
    { event: "message/classify" },
    async ({ event }) => {
      const { messageId, taskId } = event.data

      try {
        // Fetch the message and task
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          include: {
            task: {
              include: {
                entity: true,
                messages: {
                  where: { direction: "OUTBOUND" },
                  orderBy: { createdAt: "desc" },
                  take: 1
                }
              }
            }
          }
        })

        if (!message) {
          console.error(`Message ${messageId} not found`)
          return { success: false, error: "Message not found" }
        }

        // Only classify inbound messages
        if (message.direction !== "INBOUND") {
          return { success: false, error: "Only inbound messages can be classified" }
        }

        // Classify the message
        const classification = await AIClassificationService.classifyMessage({
          subject: message.subject || undefined,
          body: message.body || ""
        })

        // Update message with classification
        await prisma.message.update({
          where: { id: messageId },
          data: {
            aiClassification: classification.classification,
            aiReasoning: classification.reasoning
          }
        })

        // Analyze reply intent to determine if task is fulfilled
        if (taskId && message.task) {
          const task = message.task
          const latestOutboundMessage = task.messages[0] // Already filtered to OUTBOUND and sorted desc

          // Build context for intent analysis
          const requestSubject = latestOutboundMessage?.subject || task.campaignName || "Request"
          const requestBody = latestOutboundMessage?.body || latestOutboundMessage?.htmlBody || ""
          const requestPreview = requestBody.substring(0, 300) // First 300 chars

          const replySubject = message.subject || ""
          const replyBody = message.body || message.htmlBody || ""
          const replyPreview = replyBody.substring(0, 500) // First 500 chars

          // Use LLM to analyze reply intent and determine completion percentage (0-100)
          const openai = getOpenAIClient()
          const intentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are an AI assistant that analyzes email replies to determine request completion percentage based on intent.

Analyze the reply and assign a completion percentage (0-100) based on:
- 100%: Request is fully completed (e.g., "I just paid the invoice", "I've sent the document", "Payment completed")
- 80-90%: Strong commitment with timeline (e.g., "I'll pay this week", "I'll send it tomorrow", "I'll submit it by Friday")
- 60-79%: Moderate commitment without clear timeline (e.g., "I'll get it done soon", "I'm working on it", "I'll send it when ready")
- 40-59%: Acknowledgment but unclear commitment (e.g., "Got it", "Will do", "I understand")
- 20-39%: Questioning or needs clarification (e.g., "What format do you need?", "Can you clarify?", "Which invoice?")
- 0-19%: No progress or rejection (e.g., "I can't do this", "I don't have it", "Not possible")

Examples:
- "I just paid invoice #12345" → 100% (completed)
- "I'll pay the invoice this week" → 80% (strong commitment with timeline)
- "I'll send it tomorrow" → 85% (strong commitment with specific timeline)
- "I'm working on it, will get back to you" → 65% (moderate commitment, no timeline)
- "Got it, thanks" → 50% (acknowledgment, unclear commitment)
- "What invoice number?" → 25% (questioning/clarification needed)
- "I don't have access to that" → 10% (cannot complete)

Respond with JSON:
{
  "completionPercentage": number (0-100),
  "confidence": "High"/"Medium"/"Low",
  "reasoning": "Brief explanation of why this percentage"
}

Be accurate and realistic - use the full 0-100 scale based on actual intent, not just binary fulfilled/not fulfilled.`
              },
              {
                role: "user",
                content: `Request sent:
Subject: ${requestSubject}
Body: ${requestPreview}

Reply received:
Subject: ${replySubject}
Body: ${replyPreview}
Classification: ${classification.classification}

Has attachments: ${task.hasAttachments ? "Yes" : "No"}

Analyze the reply intent and determine the completion percentage (0-100) based on what the recipient is indicating.`
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 200
          })

          const intentResponse = intentAnalysis.choices[0]?.message?.content
          if (intentResponse) {
            try {
              const intentParsed = JSON.parse(intentResponse)
              let completionPercentage = Math.round(intentParsed.completionPercentage || 0)
              const confidence = intentParsed.confidence || "Medium"
              const reasoning = intentParsed.reasoning || "No reasoning provided"

              // Clamp completion percentage to 0-100
              completionPercentage = Math.max(0, Math.min(100, completionPercentage))

              // If attachments are present and verified, boost to 100% if not already high
              if (task.hasAttachments && task.aiVerified === true) {
                completionPercentage = 100
              } else if (task.hasAttachments && task.aiVerified === null && completionPercentage < 60) {
                // If attachments exist but not verified yet, set to 60% (pending verification)
                completionPercentage = 60
              }

              // Update task with completion percentage and status if appropriate
              const updateData: any = {
                completionPercentage,
                aiReasoning: typeof task.aiReasoning === 'object' && task.aiReasoning !== null
                  ? { ...(task.aiReasoning as object), completionAnalysis: reasoning }
                  : { completionAnalysis: reasoning }
              }

              // If completion is 100% or high confidence 95%+, mark as FULFILLED
              if (completionPercentage >= 100 || (completionPercentage >= 95 && confidence === "High")) {
                updateData.status = "FULFILLED"
                console.log(`Task ${taskId} marked as FULFILLED with ${completionPercentage}% completion (${confidence} confidence)`)
              }

              await prisma.task.update({
                where: { id: taskId },
                data: updateData
              })
              
              console.log(`[Message Classification] Task ${taskId} completion percentage updated to ${completionPercentage}% (${confidence} confidence): ${reasoning}`)

              // Execute automation rules after classification
              const { AutomationEngineService } = await import("@/lib/services/automation-engine.service")
              await AutomationEngineService.executeRules({
                taskId: taskId,
                organizationId: task.organizationId,
                messageClassification: classification.classification as any,
                hasAttachments: task.hasAttachments,
                verified: task.aiVerified || false
              })

              // Trigger risk recomputation after classification completes
              // Only recompute if no manual override exists (manual overrides take precedence)
              const updatedTaskForRisk = await prisma.task.findUnique({
                where: { id: taskId },
                include: {
                  messages: {
                    where: { direction: "OUTBOUND" },
                    orderBy: { createdAt: "desc" },
                    take: 1
                  }
                }
              })

              if (updatedTaskForRisk && !updatedTaskForRisk.manualRiskOverride) {
                const { computeRiskWithLLM, computeLastActivityAt } = await import("@/lib/services/risk-computation.service")
                
                // Get latest outbound message for request context
                const latestOutboundForRisk = updatedTaskForRisk.messages[0] || null
                const latestInboundForRisk = message // The reply we just classified
                
                // Get request prompt from task campaignName (which matches EmailDraft.suggestedCampaignName)
                const requestPrompt = task.campaignName || null
                
                try {
                  const llmRiskResult = await computeRiskWithLLM({
                    hasReplies: true,
                    latestResponseText: latestInboundForRisk.body || latestInboundForRisk.htmlBody || null,
                    latestInboundClassification: classification.classification || null,
                    completionPercentage: completionPercentage,
                    openedAt: latestOutboundForRisk?.openedAt || null,
                    lastOpenedAt: latestOutboundForRisk?.lastOpenedAt || null,
                    hasAttachments: updatedTaskForRisk.hasAttachments,
                    aiVerified: updatedTaskForRisk.aiVerified,
                    lastActivityAt: latestInboundForRisk.createdAt,
                    deadlineDate: updatedTaskForRisk.deadlineDate || null,
                    requestSubject: latestOutboundForRisk?.subject || null,
                    requestBody: latestOutboundForRisk?.body || latestOutboundForRisk?.htmlBody || null,
                    requestPrompt: requestPrompt,
                    replyText: latestInboundForRisk.body || latestInboundForRisk.htmlBody || null
                  })

                  // Persist risk computation (respecting that manual override check was already done)
                  await prisma.task.update({
                    where: { id: taskId },
                    data: {
                      readStatus: llmRiskResult.readStatus,
                      riskLevel: llmRiskResult.riskLevel,
                      riskReason: llmRiskResult.riskReason,
                      lastActivityAt: computeLastActivityAt({
                        lastOpenedAt: latestOutboundForRisk?.lastOpenedAt || null,
                        openedAt: latestOutboundForRisk?.openedAt || null,
                        lastActivityAt: latestInboundForRisk.createdAt
                      }) || latestInboundForRisk.createdAt
                    }
                  })

                  console.log(`[Risk Computation] Task ${taskId} risk updated after reply: ${llmRiskResult.riskLevel} - ${llmRiskResult.riskReason}`)
                } catch (riskError: any) {
                  console.error(`[Risk Computation] Error computing risk for task ${taskId}:`, riskError)
                  // Fallback to deterministic risk computation
                  const { computeDeterministicRisk } = await import("@/lib/services/risk-computation.service")
                  const deterministicRisk = computeDeterministicRisk({
                    hasReplies: true,
                    latestResponseText: latestInboundForRisk.body || latestInboundForRisk.htmlBody || null,
                    latestInboundClassification: classification.classification || null,
                    completionPercentage: completionPercentage,
                    openedAt: latestOutboundForRisk?.openedAt || null,
                    lastOpenedAt: latestOutboundForRisk?.lastOpenedAt || null,
                    hasAttachments: updatedTaskForRisk.hasAttachments,
                    aiVerified: updatedTaskForRisk.aiVerified,
                    lastActivityAt: latestInboundForRisk.createdAt,
                    deadlineDate: updatedTaskForRisk.deadlineDate || null
                  })
                  
                  await prisma.task.update({
                    where: { id: taskId },
                    data: {
                      readStatus: deterministicRisk.readStatus,
                      riskLevel: deterministicRisk.riskLevel,
                      riskReason: deterministicRisk.riskReason,
                      lastActivityAt: latestInboundForRisk.createdAt
                    }
                  })

                  console.log(`[Risk Computation] Task ${taskId} risk updated (deterministic fallback): ${deterministicRisk.riskLevel} - ${deterministicRisk.riskReason}`)
                }
              } else if (updatedTaskForRisk?.manualRiskOverride) {
                console.log(`[Risk Computation] Task ${taskId} has manual override (${updatedTaskForRisk.manualRiskOverride}), skipping automatic risk recomputation`)
              }
            } catch (parseError) {
              console.error(`Error parsing intent analysis for task ${taskId}:`, parseError)
            }
          }
        }

        return {
          success: true,
          classification: classification.classification,
          reasoning: classification.reasoning
        }
      } catch (error: any) {
        console.error(`Error classifying message ${messageId}:`, error)
        return { success: false, error: error.message }
      }
    }
  ),
  inngest.createFunction(
    { id: "summarize-task" },
    { event: "task/summarize" },
    async ({ event }) => {
      const { taskId, messageId } = event.data

      try {
        // Fetch task with related data
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            entity: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 10 // Get recent messages for context
            }
          }
        })

        if (!task) {
          console.error(`Task ${taskId} not found`)
          return { success: false, error: "Task not found" }
        }

        // Get latest inbound message (most recent)
        const latestInboundMessage = task.messages
          .filter(m => m.direction === "INBOUND")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        // Check idempotency: if summary exists and is based on the same latest message, skip
        if (task.aiSummary && task.aiSummaryLastMessageId === latestInboundMessage?.id) {
          return { success: true, skipped: true, reason: "Summary already exists for latest message" }
        }

        // Get latest outbound message (the request)
        const latestOutboundMessage = task.messages.find(m => m.direction === "OUTBOUND")
        
        // Get latest inbound message classification
        const latestInboundClassification = latestInboundMessage?.aiClassification || null
        const hasAttachments = task.hasAttachments || false
        const aiVerified = task.aiVerified || false

        // Build context for summary (keep it minimal for cost control)
        const requestSubject = latestOutboundMessage?.subject || task.campaignName || "Request"
        const requestBody = latestOutboundMessage?.body || latestOutboundMessage?.htmlBody || ""
        const requestPreview = requestBody.substring(0, 200) // First 200 chars only

        const responseSubject = latestInboundMessage?.subject || ""
        const responseBody = latestInboundMessage?.body || latestInboundMessage?.htmlBody || ""
        const responsePreview = responseBody.substring(0, 200) // First 200 chars only

        // Build prompt
        const prompt = `You are summarizing a task for an accounting team. Generate a 2-3 sentence summary in plain language.

Task Context:
- Request: ${requestSubject}${requestPreview ? ` - ${requestPreview}` : ""}
- Campaign: ${task.campaignName || "N/A"}
- Contact: ${task.entity.firstName || task.entity.email || "Unknown"}

Response Received:
- Subject: ${responseSubject || "No subject"}
- Body preview: ${responsePreview || "No content"}
- Classification: ${latestInboundClassification || "Not classified"}
- Has attachments: ${hasAttachments ? "Yes" : "No"}
- Document verified: ${aiVerified ? "Yes" : hasAttachments ? "Pending" : "N/A"}

Current Task Status: ${task.status}

Generate a JSON response with:
1. "summary": 2-3 sentences explaining: what was requested, what was received, current state, and what to do next (if anything)
2. "confidence": "High", "Medium", or "Low" based on how clear the information is
3. "nextStep": A short actionable next step (e.g., "Review document", "Follow up", "No action needed") or null if complete

Use plain language. Be concise.`

        // Generate summary using small model
        const openai = getOpenAIClient()
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that generates concise task summaries for accounting teams. Always respond with valid JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 200 // Keep it short
        })

        const response = completion.choices[0]?.message?.content
        if (!response) {
          throw new Error("No response from OpenAI")
        }

        const parsed = JSON.parse(response)
        const summary = parsed.summary || ""
        const confidence = parsed.confidence || "Medium"
        const nextStep = parsed.nextStep || null

        // Validate confidence value
        const validConfidence = ["High", "Medium", "Low"].includes(confidence) ? confidence : "Medium"

        // Update task with summary
        await prisma.task.update({
          where: { id: taskId },
          data: {
            aiSummary: summary,
            aiSummaryConfidence: validConfidence,
            aiSummaryLastMessageId: latestInboundMessage?.id || null
          }
        })

        return {
          success: true,
          summary,
          confidence: validConfidence,
          nextStep
        }
      } catch (error: any) {
        console.error(`Error summarizing task ${taskId}:`, error.message)
        // Don't throw - allow retry
        return { success: false, error: error.message }
      }
    }
  ),
  // Scheduled function to automatically sync Gmail accounts for new replies and opens
  inngest.createFunction(
    { 
      id: "sync-gmail-accounts",
      name: "Sync Gmail Accounts for Replies and Opens"
    },
    { 
      cron: "*/5 * * * *" // Run every 5 minutes
    },
    async () => {
      try {
        console.log("[Inngest Sync] Starting scheduled Gmail sync...")
        const result = await EmailSyncService.syncGmailAccounts()
        console.log(`[Inngest Sync] Completed: processed ${result.processed} messages, ${result.errors} errors`)
        return {
          success: true,
          processed: result.processed,
          errors: result.errors
        }
      } catch (error: any) {
        console.error("[Inngest Sync] Error syncing Gmail accounts:", error)
        // Don't throw - allow retry on next schedule
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),
]
