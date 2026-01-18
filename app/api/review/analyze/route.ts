import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

interface Finding {
  severity: "info" | "warning" | "critical"
  title: string
  explanation: string
  evidenceRef?: {
    type: "email_snippet" | "attachment"
    content?: string
    attachmentId?: string
    page?: number
  }
  suggestedAction?: string
}

interface AnalysisResult {
  summaryBullets: string[]
  findings: Finding[]
  confidence: "high" | "medium" | "low"
}

/**
 * POST /api/review/analyze
 * AI-powered analysis of a reply message
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const body = await request.json()
    const { messageId } = body

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      )
    }

    // Fetch the message with context
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        direction: "INBOUND",
        task: { organizationId }
      },
      include: {
        task: {
          include: {
            entity: true,
            job: true
          }
        },
        collectedItems: true
      }
    })

    if (!message) {
      return NextResponse.json(
        { error: "Message not found or not a reply" },
        { status: 404 }
      )
    }

    // Get the original outbound message for context
    const originalMessage = await prisma.message.findFirst({
      where: {
        taskId: message.taskId,
        direction: "OUTBOUND"
      },
      orderBy: { createdAt: "asc" }
    })

    // Build context for AI
    const requestContext = originalMessage
      ? `Original request sent:\nSubject: ${originalMessage.subject || "(no subject)"}\nBody: ${originalMessage.body || "(no body)"}`
      : "No original request found."

    const replyContext = `Reply received from: ${message.fromAddress}
Subject: ${message.subject || "(no subject)"}
Body: ${message.body || "(no body)"}`

    const attachmentContext = message.collectedItems.length > 0
      ? `Attachments received: ${message.collectedItems.map(a => `${a.filename} (${a.mimeType || "unknown type"})`).join(", ")}`
      : "No attachments."

    const jobContext = message.task.job
      ? `This reply is for task "${message.task.job.name}"`
      : ""

    const openai = getOpenAIClient()
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that analyzes business email replies. Your job is to:
1. Summarize the key points of the reply (1-3 bullets)
2. Identify any issues or findings that need attention

For findings, classify severity as:
- "info": Neutral observation, no action needed
- "warning": Potential issue, may need attention
- "critical": Requires immediate attention

Always provide actionable insights. If there are no issues, return an empty findings array.

Respond with a JSON object containing:
- summaryBullets: string[] (1-3 key points from the reply)
- findings: array of { severity, title, explanation, suggestedAction? }
- confidence: "high" | "medium" | "low" (how confident you are in the analysis)`
        },
        {
          role: "user",
          content: `${jobContext}

${requestContext}

${replyContext}

${attachmentContext}

Analyze this reply and provide structured findings.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from OpenAI")
    }

    const parsed = JSON.parse(response) as AnalysisResult

    // Ensure we have valid structure
    const result: AnalysisResult = {
      summaryBullets: parsed.summaryBullets || [],
      findings: (parsed.findings || []).map((f: any) => ({
        severity: f.severity || "info",
        title: f.title || "Observation",
        explanation: f.explanation || "",
        suggestedAction: f.suggestedAction
      })),
      confidence: parsed.confidence || "medium"
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[API/review/analyze] Error:", error)
    return NextResponse.json(
      { error: "Failed to analyze message", message: error.message },
      { status: 500 }
    )
  }
}
