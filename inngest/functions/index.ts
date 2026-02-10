import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import { runDueRemindersOnce, runDueFormRemindersOnce } from "@/lib/services/reminder-runner.service"
import { AIClassificationService } from "@/lib/services/ai-classification.service"
import { EmailSyncService } from "@/lib/services/email-sync.service"
import { ReminderStateService } from "@/lib/services/reminder-state.service"
import { EmailQueueService } from "@/lib/services/email-queue.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { AttachmentExtractionService } from "@/lib/services/attachment-extraction.service"
import { CompletionDetectionService } from "@/lib/services/completion-detection.service"
import OpenAI from "openai"
import { createHash } from "crypto"

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
      const { messageId, taskId } = event.data // taskId is actually requestId

      try {
        // Fetch the message and request with attachments (collectedItems)
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          include: {
            request: {
              include: {
                entity: true,
                messages: {
                  where: { direction: "OUTBOUND" },
                  orderBy: { createdAt: "desc" },
                  take: 1
                },
                taskInstance: {
                  select: { id: true, name: true }
                }
              }
            },
            collectedItems: {
              select: {
                id: true,
                filename: true,
                fileUrl: true,
                fileKey: true,
                mimeType: true,
                fileSize: true
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

        // Stop reminders for this recipient/request, but only if not a bounce or out-of-office
        // Bounces should NOT stop reminders since they indicate delivery issues
        if (message.request?.entityId) {
          await ReminderStateService.stopForReplyIfNotBounce(
            message.requestId!,
            message.request.entityId,
            classification.classification
          )
        }

        // ============ FIRST-PASS AI REVIEW: Extract attachment content ============
        let attachmentContent = ""
        let attachmentMetadata: Array<{ filename: string; mimeType?: string; fileSize?: number }> = []
        
        if (message.collectedItems && message.collectedItems.length > 0) {
          console.log(`[First-Pass Review] Message ${messageId} has ${message.collectedItems.length} attachments, extracting content...`)
          
          try {
            const attachmentsToExtract = message.collectedItems
              .filter((item: any) => item.fileUrl || item.fileKey)
              .map((item: any) => ({
                url: item.fileUrl || item.fileKey,
                mimeType: item.mimeType || undefined,
                filename: item.filename || "unknown"
              }))
            
            if (attachmentsToExtract.length > 0) {
              const extractionResult = await AttachmentExtractionService.extractFromMultiple(attachmentsToExtract)
              attachmentContent = extractionResult.combined
              attachmentMetadata = message.collectedItems.map((item: any) => ({
                filename: item.filename || "unknown",
                mimeType: item.mimeType || undefined,
                fileSize: item.fileSize || undefined
              }))
              
              console.log(`[First-Pass Review] Extracted ${attachmentContent.length} chars from ${attachmentsToExtract.length} attachments`)
            }
          } catch (extractError: any) {
            console.warn(`[First-Pass Review] Attachment extraction failed:`, extractError.message)
          }
        }

        // Analyze reply intent to determine if request is fulfilled
        if (taskId && message.request) {
          const task = message.request
          const latestOutboundMessage = task.messages[0] // Already filtered to OUTBOUND and sorted desc

          // Build context for intent analysis
          const requestSubject = latestOutboundMessage?.subject || task.campaignName || "Request"
          const requestBody = latestOutboundMessage?.body || latestOutboundMessage?.htmlBody || ""
          const requestPreview = requestBody.substring(0, 300) // First 300 chars

          const replySubject = message.subject || ""
          const replyBody = message.body || message.htmlBody || ""
          const replyPreview = replyBody.substring(0, 500) // First 500 chars

          // ============ COMPLETION DETECTION: Use service if attachments present ============
          let completionFromService: { completionPercentage: number; reasoning: string } | null = null
          
          if (attachmentContent || attachmentMetadata.length > 0) {
            try {
              const completionResult = await CompletionDetectionService.detectCompletion({
                requestSubject: requestSubject,
                requestBody: requestBody,
                requestPrompt: task.campaignName || task.taskInstance?.name || undefined,
                campaignType: task.campaignType || undefined,
                replyBody: replyBody,
                replySubject: replySubject,
                attachmentContent: attachmentContent || undefined,
                attachmentMetadata: attachmentMetadata.length > 0 ? attachmentMetadata : undefined
              })
              
              completionFromService = {
                completionPercentage: completionResult.completionPercentage,
                reasoning: completionResult.reasoning
              }
              
              console.log(`[First-Pass Review] CompletionDetection: ${completionResult.completionPercentage}% (${completionResult.confidence}) - ${completionResult.reasoning}`)
            } catch (completionError: any) {
              console.warn(`[First-Pass Review] Completion detection failed:`, completionError.message)
            }
          }

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
              let confidence = intentParsed.confidence || "Medium"
              let reasoning = intentParsed.reasoning || "No reasoning provided"

              // Clamp completion percentage to 0-100
              completionPercentage = Math.max(0, Math.min(100, completionPercentage))

              // If CompletionDetectionService provided a result (with attachment analysis), use it
              // The service has more context from attachment content
              if (completionFromService) {
                // Use the higher of the two percentages (benefit of doubt with actual content)
                if (completionFromService.completionPercentage > completionPercentage) {
                  completionPercentage = completionFromService.completionPercentage
                  reasoning = `(Content analysis) ${completionFromService.reasoning}`
                  confidence = "High" // Content-based is more reliable
                }
              }

              // If attachments are present and verified, boost to 100% if not already high
              if (task.hasAttachments && task.aiVerified === true) {
                completionPercentage = 100
              } else if (task.hasAttachments && task.aiVerified === null && completionPercentage < 60) {
                // If attachments exist but not verified yet, set to 60% (pending verification)
                completionPercentage = 60
              }

              // Update task with completion percentage only
              // DO NOT auto-change status - user should decide when a request is complete
              const updateData: any = {
                completionPercentage,
                aiReasoning: typeof task.aiReasoning === 'object' && task.aiReasoning !== null
                  ? { ...(task.aiReasoning as object), completionAnalysis: reasoning }
                  : { completionAnalysis: reasoning }
              }

              await prisma.request.update({
                where: { id: taskId },
                data: updateData
              })
              
              console.log(`[Message Classification] Request ${taskId} completion: ${completionPercentage}% (${confidence}) - "${reasoning.substring(0, 100)}" - status NOT auto-changed`)

              // NOTE: AutomationEngineService disabled - user should decide status manually
              // If automation rules are needed in the future, they should NOT auto-change status

              // Trigger risk recomputation after classification completes
              // Only recompute if no manual override exists (manual overrides take precedence)
              const updatedTaskForRisk = await prisma.request.findUnique({
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
                  await prisma.request.update({
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

                  console.log(`[Risk Computation] Request ${taskId} risk updated after reply: ${llmRiskResult.riskLevel} - ${llmRiskResult.riskReason}`)
                  
                  // Structured log for RAG computation (LLM path)
                  const recipientHash = createHash('sha256').update((latestInboundForRisk.fromAddress || '').toLowerCase().trim()).digest('hex').substring(0, 16)
                  console.log(JSON.stringify({
                    event: 'rag_computed',
                    requestId: taskId,
                    recipientHash,
                    timestampMs: new Date().getTime(),
                    result: {
                      riskLevel: llmRiskResult.riskLevel,
                      readStatus: llmRiskResult.readStatus
                    },
                    method: 'llm'
                  }))
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
                  
                  await prisma.request.update({
                    where: { id: taskId },
                    data: {
                      readStatus: deterministicRisk.readStatus,
                      riskLevel: deterministicRisk.riskLevel,
                      riskReason: deterministicRisk.riskReason,
                      lastActivityAt: latestInboundForRisk.createdAt
                    }
                  })

                  console.log(`[Risk Computation] Request ${taskId} risk updated (deterministic fallback): ${deterministicRisk.riskLevel} - ${deterministicRisk.riskReason}`)
                  
                  // Structured log for RAG computation (deterministic fallback)
                  const recipientHash = createHash('sha256').update((latestInboundForRisk.fromAddress || '').toLowerCase().trim()).digest('hex').substring(0, 16)
                  console.log(JSON.stringify({
                    event: 'rag_computed',
                    requestId: taskId,
                    recipientHash,
                    timestampMs: new Date().getTime(),
                    result: {
                      riskLevel: deterministicRisk.riskLevel,
                      readStatus: deterministicRisk.readStatus
                    },
                    method: 'deterministic_fallback'
                  }))
                }
              } else if (updatedTaskForRisk?.manualRiskOverride) {
                console.log(`[Risk Computation] Request ${taskId} has manual override (${updatedTaskForRisk.manualRiskOverride}), skipping automatic risk recomputation`)
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
        // Fetch request with related data
        const task = await prisma.request.findUnique({
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
          console.error(`Request ${taskId} not found`)
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
        const prompt = `You are summarizing a task for an accounting team. Generate ONE short sentence (max 25 words), plain language, no names.

Task Context:
- Request: ${requestSubject}${requestPreview ? ` - ${requestPreview}` : ""}
- Campaign: ${task.campaignName || "N/A"}

Response Received:
- Subject: ${responseSubject || "No subject"}
- Body preview: ${responsePreview || "No content"}
- Classification: ${latestInboundClassification || "Not classified"}
- Has attachments: ${hasAttachments ? "Yes" : "No"}
- Document verified: ${aiVerified ? "Yes" : hasAttachments ? "Pending" : "N/A"}

Current Task Status: ${task.status}

Generate a JSON response with:
1. "summary": ONE short sentence (max 25 words) explaining: what was requested and the latest reply outcome (no names, no fluff)
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

        // Update request with summary
        await prisma.request.update({
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
      cron: "* * * * *" // Run every 1 minute
    },
    async () => {
      try {
        console.log("[Inngest Sync] Starting scheduled Gmail sync...")
        const result = await EmailSyncService.syncGmailAccounts()
        console.log(`[Inngest Sync] Completed: ${result.accountsProcessed} accounts, ${result.messagesFetched} messages fetched, ${result.repliesPersisted} replies persisted, ${result.errors} errors`)
        return {
          success: true,
          accountsProcessed: result.accountsProcessed,
          messagesFetched: result.messagesFetched,
          repliesPersisted: result.repliesPersisted,
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
  // Scheduled function to automatically sync Microsoft/Outlook accounts for new replies
  inngest.createFunction(
    { 
      id: "sync-microsoft-accounts",
      name: "Sync Microsoft Accounts for Replies"
    },
    { 
      cron: "* * * * *" // Run every 1 minute
    },
    async () => {
      try {
        console.log("[Inngest Sync] Starting scheduled Microsoft sync...")
        const result = await EmailSyncService.syncMicrosoftAccounts()
        console.log(`[Inngest Sync] Microsoft completed: ${result.accountsProcessed} accounts, ${result.messagesFetched} messages fetched, ${result.repliesPersisted} replies persisted, ${result.errors} errors`)
        return {
          success: true,
          accountsProcessed: result.accountsProcessed,
          messagesFetched: result.messagesFetched,
          repliesPersisted: result.repliesPersisted,
          errors: result.errors
        }
      } catch (error: any) {
        console.error("[Inngest Sync] Error syncing Microsoft accounts:", error)
        // Don't throw - allow retry on next schedule
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),
  // Scheduled function to send due reminders (requests and forms)
  inngest.createFunction(
    {
      id: "reminder/send-due",
      name: "Send Due Reminders"
    },
    {
      cron: "*/15 * * * *" // Run every 15 minutes
    },
    async () => {
      try {
        // Run both request reminders and form reminders
        const [requestResult, formResult] = await Promise.all([
          runDueRemindersOnce(),
          runDueFormRemindersOnce()
        ])
        
        return { 
          success: true, 
          requests: requestResult,
          forms: formResult
        }
      } catch (error: any) {
        console.error("[Inngest Reminder] Error in reminder cron job:", error)
        // Don't throw - allow retry on next schedule
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),
  // Scheduled function to execute standing (recurring) quests
  // Feature Flag: QUEST_STANDING
  inngest.createFunction(
    {
      id: "quest/execute-standing",
      name: "Execute Standing Quests"
    },
    {
      cron: "*/5 * * * *" // Check every 5 minutes
    },
    async () => {
      // Check feature flag
      if (process.env.QUEST_STANDING !== "true") {
        return { success: true, skipped: true, reason: "QUEST_STANDING feature flag is disabled" }
      }

      try {
        const { QuestService } = await import("@/lib/services/quest.service")
        
        // Find all standing quests due for execution
        const dueQuests = await QuestService.findDueStandingQuests()
        
        if (dueQuests.length === 0) {
          return { success: true, questsProcessed: 0 }
        }

        console.log(`[Quest Standing] Found ${dueQuests.length} standing quests due for execution`)

        const results: Array<{
          questId: string
          success: boolean
          emailsSent?: number
          error?: string
        }> = []

        for (const quest of dueQuests) {
          try {
            console.log(`[Quest Standing] Executing standing quest ${quest.id}`)
            
            const result = await QuestService.executeStandingOccurrence(
              quest.id,
              quest.organizationId
            )

            results.push({
              questId: quest.id,
              success: result.success,
              emailsSent: result.emailsSent
            })

            console.log(`[Quest Standing] Quest ${quest.id} executed: ${result.emailsSent} emails sent`)
          } catch (error: any) {
            console.error(`[Quest Standing] Error executing quest ${quest.id}:`, error)
            results.push({
              questId: quest.id,
              success: false,
              error: error.message
            })
          }
        }

        const successful = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length
        const totalEmailsSent = results.reduce((sum, r) => sum + (r.emailsSent || 0), 0)

        console.log(`[Quest Standing] Completed: ${successful} successful, ${failed} failed, ${totalEmailsSent} total emails sent`)

        return {
          success: true,
          questsProcessed: dueQuests.length,
          successful,
          failed,
          totalEmailsSent,
          results
        }
      } catch (error: any) {
        console.error("[Quest Standing] Error in standing quest cron job:", error)
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),

  // Process queued emails (rate-limited emails waiting to be sent)
  // Runs every hour to check for emails that can now be sent
  inngest.createFunction(
    { 
      id: "process-email-queue",
      throttle: {
        limit: 1,
        period: "5m"  // Prevent concurrent runs
      }
    },
    { cron: "0 * * * *" },  // Every hour on the hour
    async () => {
      console.log("[Email Queue] Starting queue processing...")
      
      try {
        // Get pending emails that are ready to be sent
        const pendingEmails = await EmailQueueService.getPendingEmails(50)
        
        if (pendingEmails.length === 0) {
          console.log("[Email Queue] No pending emails to process")
          return { success: true, processed: 0, sent: 0, failed: 0 }
        }
        
        console.log(`[Email Queue] Found ${pendingEmails.length} pending emails`)
        
        let sent = 0
        let failed = 0
        
        for (const email of pendingEmails) {
          try {
            // Try to claim the email for processing
            const claimed = await EmailQueueService.markProcessing(email.id)
            if (!claimed) {
              console.log(`[Email Queue] Email ${email.id} already being processed by another worker`)
              continue
            }
            
            console.log(`[Email Queue] Processing email ${email.id} to ${email.toEmail}`)
            
            // Extract metadata
            const metadata = email.metadata as Record<string, any> || {}
            
            // Send the email with skipRateLimit=true since we're processing from the queue
            // The rate limit has already passed (that's why it's in the queue)
            await EmailSendingService.sendEmail({
              organizationId: email.organizationId,
              jobId: email.taskInstanceId || undefined,
              to: email.toEmail,
              subject: email.subject,
              body: email.body,
              htmlBody: email.htmlBody || undefined,
              campaignName: metadata.campaignName,
              campaignType: metadata.campaignType,
              accountId: email.accountId || undefined,
              deadlineDate: metadata.deadlineDate ? new Date(metadata.deadlineDate) : null,
              skipRateLimit: true,  // Important: skip rate limit check for queued emails
              remindersConfig: metadata.remindersConfig
            })
            
            await EmailQueueService.markSent(email.id)
            sent++
            console.log(`[Email Queue] Successfully sent email ${email.id}`)
            
          } catch (error: any) {
            console.error(`[Email Queue] Failed to send email ${email.id}:`, error.message)
            await EmailQueueService.markFailed(email.id, error.message)
            failed++
          }
        }
        
        console.log(`[Email Queue] Completed: ${sent} sent, ${failed} failed out of ${pendingEmails.length} processed`)
        
        return {
          success: true,
          processed: pendingEmails.length,
          sent,
          failed
        }
      } catch (error: any) {
        console.error("[Email Queue] Error processing queue:", error)
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),

  // Auto-create recurring boards based on schedule
  // Runs every hour to ensure all scheduled boards exist up to today
  // Schedule-based: creates boards regardless of previous board status
  // No auto-completion: users manually complete boards when ready
  inngest.createFunction(
    { 
      id: "auto-create-period-boards",
      throttle: {
        limit: 1,
        period: "30m"  // Prevent concurrent runs
      }
    },
    { cron: "0 * * * *" },  // Every hour on the hour (more reliable than just midnight)
    async () => {
      const now = new Date()
      console.log(`[Board Automation] Starting at ${now.toISOString()} (server time)`)
      
      try {
        // Import BoardService dynamically to avoid circular deps
        const { BoardService, calculateNextPeriodStart } = await import("@/lib/services/board.service")
        const { toZonedTime, formatInTimeZone } = await import("date-fns-tz")
        
        // Helper to get today's date (YYYY-MM-DD) in a specific timezone
        const getTodayInTimezone = (timezone: string): string => {
          return formatInTimeZone(now, timezone, "yyyy-MM-dd")
        }
        
        // Find the latest board for each recurring series
        // Group by organization + cadence to find each unique recurring series
        const latestBoards = await prisma.board.findMany({
          where: {
            automationEnabled: true,
            cadence: { not: "AD_HOC" },
            periodStart: { not: null }
          },
          include: {
            organization: { select: { fiscalYearStartMonth: true, timezone: true } }
          },
          orderBy: { periodStart: "desc" }
        })
        
        if (latestBoards.length === 0) {
          console.log("[Board Automation] No recurring boards with automation enabled")
          return { success: true, processed: 0, created: 0, note: "No automated boards found" }
        }
        
        console.log(`[Board Automation] Found ${latestBoards.length} boards with automation enabled`)
        
        // Group boards by organization + cadence to find the latest in each series
        const seriesMap = new Map<string, typeof latestBoards[0]>()
        for (const board of latestBoards) {
          const key = `${board.organizationId}:${board.cadence}`
          if (!seriesMap.has(key)) {
            seriesMap.set(key, board)
          }
        }
        
        console.log(`[Board Automation] Found ${seriesMap.size} unique recurring board series`)
        
        let totalCreated = 0
        let failed = 0
        const results: { seriesKey: string; boardsCreated: number; latestPeriod?: string; nextPeriod?: string; orgTimezone?: string; todayInTz?: string; error?: string }[] = []
        
        for (const [seriesKey, latestBoard] of seriesMap) {
          try {
            // Use the organization's timezone to determine "today"
            const orgTimezone = latestBoard.organization?.timezone
            
            // Skip orgs without timezone configured (or with UTC default which indicates not configured)
            if (!orgTimezone || orgTimezone === "UTC") {
              console.warn(`[Board Automation] Skipping series ${seriesKey}: Organization timezone not configured (current: "${orgTimezone || 'null'}")`)
              results.push({ 
                seriesKey, 
                boardsCreated: 0, 
                error: `Skipped: Organization timezone not configured. Please set timezone in Settings → Accounting Calendar.` 
              })
              continue
            }
            
            const todayStr = getTodayInTimezone(orgTimezone)
            
            const latestPeriodStr = latestBoard.periodStart?.toISOString().split('T')[0] || 'N/A'
            console.log(`[Board Automation] Processing series: ${seriesKey}`)
            console.log(`[Board Automation]   Org timezone: ${orgTimezone}, today in org tz: ${todayStr}`)
            console.log(`[Board Automation]   Latest board: "${latestBoard.name}" (id: ${latestBoard.id})`)
            console.log(`[Board Automation]   Latest periodStart: ${latestPeriodStr}`)
            console.log(`[Board Automation]   Cadence: ${latestBoard.cadence}, skipWeekends: ${latestBoard.skipWeekends}`)
            
            const fiscalYearStartMonth = latestBoard.organization?.fiscalYearStartMonth ?? 1
            let seriesCreated = 0
            let currentBoardId = latestBoard.id
            let currentPeriodStart = latestBoard.periodStart
            let iterations = 0
            const maxIterations = 365 // Safety limit
            
            // Keep creating boards until we've caught up to today (in org's timezone)
            while (currentPeriodStart && iterations < maxIterations) {
              iterations++
              
              const nextPeriodStart = calculateNextPeriodStart(
                latestBoard.cadence,
                currentPeriodStart,
                orgTimezone,
                { skipWeekends: latestBoard.skipWeekends, fiscalYearStartMonth }
              )
              
              // Format nextPeriodStart as YYYY-MM-DD for comparison
              const nextPeriodStr = nextPeriodStart?.toISOString().split('T')[0] || 'null'
              
              if (!nextPeriodStart) {
                console.log(`[Board Automation]   No next period calculated, stopping`)
                break
              }
              
              // Compare dates as strings (YYYY-MM-DD) - both are date-only so this works
              if (nextPeriodStr > todayStr) {
                console.log(`[Board Automation]   Next period ${nextPeriodStr} > today ${todayStr} (${orgTimezone}), caught up`)
                results.push({ seriesKey, boardsCreated: seriesCreated, latestPeriod: latestPeriodStr, nextPeriod: nextPeriodStr, orgTimezone, todayInTz: todayStr })
                break
              }
              
              console.log(`[Board Automation]   Attempting to create board for period ${nextPeriodStr}...`)
              
              // Try to create the next board (has idempotency check)
              const newBoard = await BoardService.createNextPeriodBoard(
                currentBoardId,
                latestBoard.organizationId,
                latestBoard.ownerId || latestBoard.createdById
              )
              
              if (newBoard) {
                seriesCreated++
                totalCreated++
                console.log(`[Board Automation]   Created board: "${newBoard.name}" (${newBoard.id})`)
                currentBoardId = newBoard.id
                currentPeriodStart = newBoard.periodStart
              } else {
                // Board might already exist, try to find it and continue from there
                const existingBoard = await prisma.board.findFirst({
                  where: {
                    organizationId: latestBoard.organizationId,
                    cadence: latestBoard.cadence,
                    periodStart: nextPeriodStart
                  }
                })
                
                if (existingBoard) {
                  console.log(`[Board Automation]   Board already exists: "${existingBoard.name}" (${existingBoard.id})`)
                  currentBoardId = existingBoard.id
                  currentPeriodStart = existingBoard.periodStart
                } else {
                  // Something else went wrong, stop this series
                  console.log(`[Board Automation]   ERROR: Could not create or find board for ${nextPeriodStr}`)
                  results.push({ seriesKey, boardsCreated: seriesCreated, latestPeriod: latestPeriodStr, error: `Failed at ${nextPeriodStr}` })
                  break
                }
              }
            }
            
            if (iterations >= maxIterations) {
              console.warn(`[Board Automation]   Hit max iterations for series ${seriesKey}`)
            }
            
            if (!results.find(r => r.seriesKey === seriesKey)) {
              results.push({ seriesKey, boardsCreated: seriesCreated, latestPeriod: latestPeriodStr })
            }
            console.log(`[Board Automation]   Series complete: ${seriesCreated} boards created`)
            
          } catch (error: any) {
            console.error(`[Board Automation] Failed to process series ${seriesKey}:`, error.message)
            failed++
            results.push({ seriesKey, boardsCreated: 0, error: error.message })
          }
        }
        
        console.log(`[Board Automation] Completed: ${totalCreated} total boards created, ${failed} series failed`)
        
        return {
          success: true,
          runTime: now.toISOString(),
          seriesProcessed: seriesMap.size,
          totalCreated,
          failed,
          results
        }
      } catch (error: any) {
        console.error("[Board Automation] Error in auto-create period boards:", error)
        return {
          success: false,
          error: error.message
        }
      }
    }
  ),

]
