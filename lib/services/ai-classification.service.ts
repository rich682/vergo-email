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
    const subject = (data.subject || "").toLowerCase()
    const body = (data.body || "").toLowerCase()
    const from = (data.fromAddress || "").toLowerCase()
    
    // Bounce detection - delivery failures from mail servers
    const bounceIndicators = [
      // From addresses
      from.includes("mailer-daemon"),
      from.includes("postmaster"),
      from.includes("mail delivery"),
      from.includes("maildelivery"),
      // Subject patterns
      subject.includes("delivery status notification"),
      subject.includes("undeliverable"),
      subject.includes("mail delivery failed"),
      subject.includes("delivery failure"),
      subject.includes("returned mail"),
      subject.includes("delivery has failed"),
      subject.includes("message not delivered"),
      // Body patterns
      body.includes("address not found"),
      body.includes("address couldn't be found"),
      body.includes("user unknown"),
      body.includes("no such user"),
      body.includes("mailbox not found"),
      body.includes("mailbox unavailable"),
      body.includes("recipient rejected"),
      body.includes("550 5.1.1"),
      body.includes("550-5.1.1"),
      body.includes("550 user unknown"),
      body.includes("action: failed"),
      body.includes("status: 5."),
      body.includes("diagnostic-code: smtp"),
      body.includes("the email account that you tried to reach does not exist"),
      body.includes("wasn't delivered to"),
      body.includes("could not be delivered"),
      body.includes("permanent failure"),
      body.includes("mailbox full"),
      body.includes("over quota")
    ]
    
    if (bounceIndicators.some(Boolean)) {
      return MessageClassification.BOUNCE
    }
    
    // Out of office detection
    const oooIndicators = [
      subject.includes("out of office"),
      subject.includes("out of the office"),
      subject.includes("automatic reply"),
      subject.includes("auto-reply"),
      subject.includes("autoreply"),
      subject.includes("away from"),
      subject.includes("on vacation"),
      subject.includes("on leave"),
      subject.includes("on holiday"),
      body.includes("i am currently out of the office"),
      body.includes("i'm currently out of the office"),
      body.includes("i will be out of the office"),
      body.includes("i am away from"),
      body.includes("i'm away from"),
      body.includes("limited access to email"),
      body.includes("will respond when i return"),
      body.includes("will reply when i return")
    ]
    
    if (oooIndicators.some(Boolean)) {
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

