/**
 * Completion Detection Service
 * Determines if a submission (email + attachments) fulfills a request.
 * Uses AI to analyze content against request context.
 */

import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"

export interface CompletionDetectionInput {
  // Request context
  requestSubject?: string
  requestBody?: string
  requestPrompt?: string // Original job/campaign name
  campaignType?: string // W9, COI, INVOICE, etc.
  
  // Reply content
  replyBody?: string
  replySubject?: string
  
  // Extracted attachment content
  attachmentContent?: string
  attachmentMetadata?: Array<{
    filename: string
    mimeType?: string
    fileSize?: number
  }>
}

export interface CompletionDetectionResult {
  isComplete: boolean
  completionPercentage: number // 0-100
  confidence: "high" | "medium" | "low"
  reasoning: string
  missingItems?: string[]
  suggestedAction?: string
}

export class CompletionDetectionService {
  /**
   * Detect if a submission fulfills the original request
   */
  static async detectCompletion(
    input: CompletionDetectionInput
  ): Promise<CompletionDetectionResult> {
    // Quick deterministic checks first
    const deterministicResult = this.runDeterministicChecks(input)
    if (deterministicResult) {
      return deterministicResult
    }

    // Use AI for nuanced detection
    try {
      return await this.detectWithAI(input)
    } catch (error: any) {
      console.warn("[CompletionDetection] AI detection failed:", error.message)
      return this.getFallbackResult(input)
    }
  }

  /**
   * Run deterministic checks before AI
   */
  static runDeterministicChecks(
    input: CompletionDetectionInput
  ): CompletionDetectionResult | null {
    const replyLower = (input.replyBody || "").toLowerCase()
    const attachmentLower = (input.attachmentContent || "").toLowerCase()
    const hasAttachment = input.attachmentMetadata && input.attachmentMetadata.length > 0

    // Check for explicit refusal/inability
    const refusalPhrases = [
      "cannot provide",
      "can't provide",
      "unable to",
      "don't have",
      "do not have",
      "not available",
      "no longer",
      "refuse",
      "decline"
    ]

    if (refusalPhrases.some(phrase => replyLower.includes(phrase))) {
      return {
        isComplete: false,
        completionPercentage: 0,
        confidence: "high",
        reasoning: "Reply indicates inability or refusal to complete request",
        missingItems: ["Requested item not provided due to refusal/inability"],
        suggestedAction: "Follow up to understand blockers or find alternative"
      }
    }

    // Check for explicit completion indicators with attachment
    const completionPhrases = [
      "attached",
      "enclosed",
      "please find",
      "here is",
      "here are",
      "sending you",
      "as requested"
    ]

    if (hasAttachment && completionPhrases.some(phrase => replyLower.includes(phrase))) {
      // High confidence completion if they say "attached" and there's an attachment
      return {
        isComplete: true,
        completionPercentage: 95,
        confidence: "high",
        reasoning: "Reply indicates attachment provided, and attachment is present",
        suggestedAction: "Review attachment to verify content matches request"
      }
    }

    // Check campaign-specific document types
    if (input.campaignType && hasAttachment) {
      const result = this.checkCampaignTypeCompletion(input)
      if (result) {
        return result
      }
    }

    // No deterministic result - use AI
    return null
  }

  /**
   * Check completion based on campaign type and attachment
   */
  static checkCampaignTypeCompletion(
    input: CompletionDetectionInput
  ): CompletionDetectionResult | null {
    const attachments = input.attachmentMetadata || []
    const content = (input.attachmentContent || "").toLowerCase()

    switch (input.campaignType) {
      case "W9":
        // W-9 form typically contains "Request for Taxpayer" or "TIN"
        if (content.includes("request for taxpayer") || 
            content.includes("taxpayer identification") ||
            content.includes("w-9")) {
          return {
            isComplete: true,
            completionPercentage: 90,
            confidence: "high",
            reasoning: "W-9 form detected in attachment content",
            suggestedAction: "Verify form is complete and signed"
          }
        }
        break

      case "COI":
        // Certificate of Insurance typically contains "certificate of insurance" or "policy number"
        if (content.includes("certificate of insurance") ||
            content.includes("certificate holder") ||
            content.includes("policy number")) {
          return {
            isComplete: true,
            completionPercentage: 90,
            confidence: "high",
            reasoning: "Certificate of Insurance detected in attachment",
            suggestedAction: "Verify coverage dates and policy details"
          }
        }
        break

      case "INVOICE":
        // Invoice typically contains amount and invoice number
        if (content.includes("invoice") &&
            (content.includes("amount") || content.includes("total") || content.includes("due"))) {
          return {
            isComplete: true,
            completionPercentage: 85,
            confidence: "medium",
            reasoning: "Invoice document detected in attachment",
            suggestedAction: "Verify invoice number and amounts"
          }
        }
        break

      case "TIMESHEET":
        // Timesheet typically contains hours, dates
        if ((content.includes("timesheet") || content.includes("time sheet")) ||
            (content.includes("hours") && content.includes("date"))) {
          return {
            isComplete: true,
            completionPercentage: 85,
            confidence: "medium",
            reasoning: "Timesheet data detected in attachment",
            suggestedAction: "Verify hours and dates are accurate"
          }
        }
        break
    }

    return null
  }

  /**
   * Use AI for nuanced completion detection
   */
  static async detectWithAI(
    input: CompletionDetectionInput
  ): Promise<CompletionDetectionResult> {
    const openai = getOpenAIClient()

    // Build context for AI
    const requestContext = [
      input.requestPrompt ? `Request: ${input.requestPrompt}` : null,
      input.campaignType ? `Type: ${input.campaignType}` : null,
      input.requestSubject ? `Subject: ${input.requestSubject}` : null,
      input.requestBody ? `Body: ${input.requestBody.substring(0, 500)}` : null
    ].filter(Boolean).join("\n")

    const replyContext = [
      input.replySubject ? `Subject: ${input.replySubject}` : null,
      input.replyBody ? `Body: ${input.replyBody.substring(0, 500)}` : null
    ].filter(Boolean).join("\n")

    const attachmentContext = input.attachmentContent
      ? `Attachment content:\n${input.attachmentContent.substring(0, 2000)}`
      : "No attachments or content not extracted"

    const attachmentList = input.attachmentMetadata?.length
      ? `Files: ${input.attachmentMetadata.map(a => a.filename).join(", ")}`
      : "No files attached"

    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that determines if a submission fulfills an accounting request.

Analyze the original request and the reply (including any attachment content) to determine:
1. Is the request fulfilled? (yes/no/partial)
2. Completion percentage (0-100)
3. What's missing (if anything)
4. Confidence level

Be conservative - if unclear, mark as partial completion. Focus on whether the specific requested item was provided.

Respond with JSON:
{
  "isComplete": boolean,
  "completionPercentage": number (0-100),
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation",
  "missingItems": ["item1", "item2"] (optional, if incomplete),
  "suggestedAction": "What to do next" (optional)
}`
        },
        {
          role: "user",
          content: `ORIGINAL REQUEST:
${requestContext || "No request context available"}

REPLY RECEIVED:
${replyContext || "No reply body"}

${attachmentList}

${attachmentContext}

Determine if this submission fulfills the original request.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(response)

    return {
      isComplete: parsed.isComplete === true,
      completionPercentage: Math.min(100, Math.max(0, parsed.completionPercentage || 0)),
      confidence: parsed.confidence || "medium",
      reasoning: parsed.reasoning || "AI analysis complete",
      missingItems: parsed.missingItems,
      suggestedAction: parsed.suggestedAction
    }
  }

  /**
   * Fallback result when AI is unavailable
   */
  static getFallbackResult(input: CompletionDetectionInput): CompletionDetectionResult {
    const hasAttachment = input.attachmentMetadata && input.attachmentMetadata.length > 0
    const hasReply = !!(input.replyBody && input.replyBody.trim())

    if (hasAttachment) {
      return {
        isComplete: false,
        completionPercentage: 60,
        confidence: "low",
        reasoning: "Attachment received but content analysis unavailable",
        suggestedAction: "Manual review required to verify content"
      }
    }

    if (hasReply) {
      return {
        isComplete: false,
        completionPercentage: 30,
        confidence: "low",
        reasoning: "Reply received but no attachment - manual review needed",
        suggestedAction: "Check if reply addresses request or needs follow-up"
      }
    }

    return {
      isComplete: false,
      completionPercentage: 0,
      confidence: "low",
      reasoning: "Insufficient data to determine completion",
      suggestedAction: "Follow up with recipient"
    }
  }
}
