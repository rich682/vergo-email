import { getOpenAIClient } from "@/lib/utils/openai-client"
import { getStorageService } from "./storage.service"

export interface VerificationResult {
  verified: boolean
  documentType?: string
  confidence: number
  reasoning: string
  issues?: string[]
}

export class DocumentVerificationService {
  static async verifyDocument(data: {
    taskId: string
    documentKey: string
    expectedType?: string // W-9, COI, Expense, etc.
  }): Promise<VerificationResult> {
    // Download document
    const storage = getStorageService()
    const documentBuffer = await storage.download(data.documentKey)

    // Convert to base64 for OpenAI Vision
    const base64Document = documentBuffer.toString("base64")

    // Determine content type from key
    const contentType = this.getContentTypeFromKey(data.documentKey)

    // Use GPT-4o Vision to verify document
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that verifies documents for accounting teams.
          Analyze the document and determine:
          1. If it matches the expected document type (${data.expectedType || "any"})
          2. If it appears to be complete and valid
          3. Any issues or missing information
          
          Respond with a JSON object containing:
          - verified: boolean (true if document is valid and matches expected type)
          - documentType: string (the type of document detected)
          - confidence: number between 0 and 1
          - reasoning: string (explanation of verification)
          - issues: array of strings (any issues found, empty if none)`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please verify this document. Expected type: ${data.expectedType || "any"}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${contentType};base64,${base64Document}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from OpenAI")
    }

    const parsed = JSON.parse(response)
    return {
      verified: parsed.verified || false,
      documentType: parsed.documentType,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || "",
      issues: parsed.issues || []
    }
  }

  private static getContentTypeFromKey(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase()
    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif"
    }

    return contentTypes[ext || ""] || "application/octet-stream"
  }
}

