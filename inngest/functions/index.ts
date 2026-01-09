import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import { AIClassificationService } from "@/lib/services/ai-classification.service"
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
        // Fetch the message
        const message = await prisma.message.findUnique({
          where: { id: messageId }
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
]
