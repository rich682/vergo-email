import OpenAI from "openai"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

export enum MessageClassification {
  DATA = "DATA",
  QUESTION = "QUESTION",
  COMPLAINT = "COMPLAINT",
  ACKNOWLEDGMENT = "ACKNOWLEDGMENT",
  OTHER = "OTHER"
}

export interface ClassificationResult {
  classification: MessageClassification
  confidence: number
  reasoning: string
}

export class AIClassificationService {
  static async classifyMessage(data: {
    subject?: string
    body: string
  }): Promise<ClassificationResult> {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that classifies email messages into categories:
- DATA: Message contains data, documents, or information being submitted
- QUESTION: Message asks a question or requests information
- COMPLAINT: Message expresses dissatisfaction or a complaint
- ACKNOWLEDGMENT: Message acknowledges receipt or confirms something
- OTHER: Message doesn't fit the above categories

Respond with a JSON object containing:
- classification: one of the categories above
- confidence: a number between 0 and 1
- reasoning: a brief explanation of the classification`
        },
        {
          role: "user",
          content: `Subject: ${data.subject || "(no subject)"}\n\nBody: ${data.body}`
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

