import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { isBounce, isOutOfOffice } from "@/lib/utils/bounce-detection"

export enum MessageClassification {
  DATA = "DATA",
  QUESTION = "QUESTION",
  COMPLAINT = "COMPLAINT",
  ACKNOWLEDGMENT = "ACKNOWLEDGMENT",
  BOUNCE = "BOUNCE", // Delivery failure / address not found / mailbox full
  OUT_OF_OFFICE = "OUT_OF_OFFICE", // Auto-reply indicating person is away
  OTHER = "OTHER"
}

export interface ClassificationResult {
  classification: MessageClassification
  confidence: number
  reasoning: string
}

export class AIClassificationService {
  /**
   * Fast deterministic check for bounce/delivery failure messages
   * These come from mail servers and have predictable patterns
   */
  static detectBounceOrAutoReply(data: { subject?: string; body: string; fromAddress?: string }): MessageClassification | null {
    if (isBounce({ subject: data.subject, body: data.body, fromAddress: data.fromAddress })) {
      return MessageClassification.BOUNCE
    }
    if (isOutOfOffice({ subject: data.subject, body: data.body })) {
      return MessageClassification.OUT_OF_OFFICE
    }
    return null
  }

  static async classifyMessage(data: {
    subject?: string
    body: string
    fromAddress?: string
  }): Promise<ClassificationResult> {
    // First, check for bounce/auto-reply deterministically (fast path)
    const deterministicClassification = this.detectBounceOrAutoReply(data)
    if (deterministicClassification) {
      return {
        classification: deterministicClassification,
        confidence: 0.95,
        reasoning: deterministicClassification === MessageClassification.BOUNCE 
          ? "Detected delivery failure notification from mail server"
          : "Detected out-of-office auto-reply"
      }
    }
    
    const openai = getOpenAIClient()
    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that classifies email messages into categories:
- DATA: Message contains data, documents, or information being submitted
- QUESTION: Message asks a question or requests information
- COMPLAINT: Message expresses dissatisfaction or a complaint
- ACKNOWLEDGMENT: Message acknowledges receipt or confirms something
- BOUNCE: Delivery failure notification (address not found, mailbox full, etc.) - from mail servers like mailer-daemon
- OUT_OF_OFFICE: Auto-reply indicating the person is away/on vacation
- OTHER: Message doesn't fit the above categories

Respond with a JSON object containing:
- classification: one of the categories above
- confidence: a number between 0 and 1
- reasoning: a brief explanation of the classification`
        },
        {
          role: "user",
          content: `From: ${data.fromAddress || "(unknown)"}\nSubject: ${data.subject || "(no subject)"}\n\nBody: ${data.body}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from OpenAI")
    }

    const parsed = JSON.parse(response)
    return {
      classification: parsed.classification as MessageClassification,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || ""
    }
  }
}

