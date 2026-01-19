import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

// Current prompt version - increment when prompt changes significantly
const PROMPT_VERSION = "v2" // Bumped for memory-aware analysis

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
 * Derive recommended action from findings
 * - If any critical or warning findings -> NEEDS_FOLLOW_UP
 * - Otherwise -> REVIEWED (safe to mark as complete)
 */
function deriveRecommendedAction(findings: Finding[]): "REVIEWED" | "NEEDS_FOLLOW_UP" {
  const hasCritical = findings.some(f => f.severity === "critical")
  const hasWarning = findings.some(f => f.severity === "warning")
  
  if (hasCritical || hasWarning) {
    return "NEEDS_FOLLOW_UP"
  }
  return "REVIEWED"
}

/**
 * Generate a brief reasoning string from findings
 */
function generateReasoning(findings: Finding[], recommendedAction: string): string {
  if (findings.length === 0) {
    return "No issues found. Reply appears complete and satisfactory."
  }
  
  const criticalCount = findings.filter(f => f.severity === "critical").length
  const warningCount = findings.filter(f => f.severity === "warning").length
  
  if (criticalCount > 0) {
    return `${criticalCount} critical issue(s) found requiring immediate attention.`
  }
  if (warningCount > 0) {
    return `${warningCount} potential issue(s) found that may need follow-up.`
  }
  return "Informational observations noted. No action required."
}

/**
 * Format date for prompt context
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "Not set"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  })
}

/**
 * Summarize thread messages for context (limit tokens)
 */
function summarizeThread(messages: Array<{ direction: string; body: string | null; subject: string | null; createdAt: Date }>): string {
  if (messages.length === 0) return "No prior messages."
  
  return messages
    .slice(-5) // Last 5 messages for context
    .map((m, i) => {
      const dir = m.direction === "OUTBOUND" ? "SENT" : "RECEIVED"
      const body = (m.body || "").substring(0, 200)
      return `[${i + 1}] ${dir}: ${m.subject || "(no subject)"}\n${body}${body.length >= 200 ? "..." : ""}`
    })
    .join("\n\n")
}

/**
 * Summarize prior AI recommendations for learning context
 */
function summarizePriorRecommendations(recs: Array<{ recommendedAction: string; humanAction: string | null; reasoning: string }>): string {
  if (recs.length === 0) return "No prior AI assessments for this task."
  
  return recs.map((r, i) => {
    const agreed = r.humanAction ? (r.humanAction === r.recommendedAction ? "agreed" : "disagreed") : "pending"
    return `[${i + 1}] AI recommended: ${r.recommendedAction}, Human: ${r.humanAction || "not yet acted"} (${agreed})`
  }).join("\n")
}

/**
 * POST /api/review/analyze
 * AI-powered analysis of a reply message with MEMORY
 * Persists the recommendation for feedback loop
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

    // Fetch the message with full context
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
            job: {
              include: {
                board: {
                  select: { id: true, name: true }
                }
              }
            }
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

    // IDEMPOTENCY: Check if recommendation already exists for this message + prompt version
    const existingRecommendation = await prisma.aIRecommendation.findFirst({
      where: {
        messageId,
        promptVersion: PROMPT_VERSION
      },
      orderBy: { createdAt: "desc" }
    })

    if (existingRecommendation) {
      // Return existing recommendation
      return NextResponse.json({
        id: existingRecommendation.id,
        summaryBullets: existingRecommendation.summaryBullets || [],
        findings: existingRecommendation.findings || [],
        recommendedAction: existingRecommendation.recommendedAction,
        reasoning: existingRecommendation.reasoning,
        confidence: "medium",
        isExisting: true
      })
    }

    // ============ MEMORY QUERIES ============

    // 1. Full thread (all messages for this task)
    const threadMessages = await prisma.message.findMany({
      where: { taskId: message.taskId },
      orderBy: { createdAt: "asc" },
      select: { direction: true, body: true, subject: true, createdAt: true }
    })

    // 2. Prior AIRecommendations for this task (agreement history)
    const priorRecommendations = await prisma.aIRecommendation.findMany({
      where: { 
        taskId: message.taskId,
        id: { not: existingRecommendation?.id } // Exclude current if any
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { recommendedAction: true, humanAction: true, reasoning: true }
    })

    // 3. Contact history (if entity exists) - prior tasks with this contact
    let contactHistorySummary = "No prior history with this contact."
    if (message.task.entityId) {
      const contactHistory = await prisma.task.findMany({
        where: { 
          entityId: message.task.entityId, 
          organizationId,
          id: { not: message.taskId } // Exclude current task
        },
        take: 3,
        orderBy: { createdAt: "desc" },
        include: { 
          messages: { 
            take: 1, 
            orderBy: { createdAt: "desc" },
            select: { body: true, direction: true }
          },
          aiRecommendations: { 
            take: 1, 
            orderBy: { createdAt: "desc" },
            select: { recommendedAction: true, humanAction: true }
          }
        }
      })

      if (contactHistory.length > 0) {
        contactHistorySummary = contactHistory.map((t, i) => {
          const lastMsg = t.messages[0]
          const lastRec = t.aiRecommendations[0]
          return `[${i + 1}] Task: ${t.campaignName || "Untitled"} - Last message: ${lastMsg?.body?.substring(0, 100) || "none"}${lastRec ? `, AI: ${lastRec.recommendedAction}` : ""}`
        }).join("\n")
      }
    }

    // 4. Task/Job/Board context with deadline
    const job = message.task.job
    const board = job?.board
    const deadline = message.task.deadlineDate || job?.dueDate

    // ============ BUILD PROMPT CONTEXT ============

    const taskContext = [
      job ? `Task: "${job.name}"` : null,
      board ? `Board: "${board.name}"` : null,
      message.task.campaignName ? `Campaign: ${message.task.campaignName}` : null,
      `Deadline: ${formatDate(deadline)}`
    ].filter(Boolean).join(" | ")

    const threadContext = summarizeThread(threadMessages)
    const priorRecsContext = summarizePriorRecommendations(priorRecommendations)

    const currentReplyContext = `
CURRENT REPLY (being analyzed):
From: ${message.fromAddress}
Subject: ${message.subject || "(no subject)"}
Body: ${message.body || "(no body)"}`

    const attachmentContext = message.collectedItems.length > 0
      ? `Attachments received: ${message.collectedItems.map(a => `${a.filename} (${a.mimeType || "unknown type"}, ${a.fileSize ? Math.round(a.fileSize / 1024) + "KB" : "size unknown"})`).join(", ")}`
      : "No attachments received."

    // ============ AI ANALYSIS ============

    const openai = getOpenAIClient()
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant analyzing business email replies for an accounting team. You have access to MEMORY - historical context about this task and contact.

Your job is to:
1. Summarize the key points of the current reply (2-3 bullets max)
2. Identify any issues or missing items that need attention
3. Consider the deadline and prior interactions when assessing urgency

For findings, classify severity as:
- "info": Neutral observation, no action needed
- "warning": Potential issue, may need follow-up (e.g., missing document, unclear response)
- "critical": Requires immediate attention (e.g., rejection, deadline risk)

Use prior AI assessments and human decisions to calibrate your judgment. If humans have consistently disagreed with AI recommendations, be more conservative.

Respond with a JSON object containing:
- summaryBullets: string[] (2-3 key points from the reply)
- findings: array of { severity, title, explanation, suggestedAction? }
- confidence: "high" | "medium" | "low"`
        },
        {
          role: "user",
          content: `CONTEXT:
${taskContext}

THREAD HISTORY:
${threadContext}

PRIOR AI ASSESSMENTS FOR THIS TASK:
${priorRecsContext}

CONTACT HISTORY (other tasks with this person):
${contactHistorySummary}

${currentReplyContext}

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
    const findings: Finding[] = (parsed.findings || []).map((f: any) => ({
      severity: f.severity || "info",
      title: f.title || "Observation",
      explanation: f.explanation || "",
      suggestedAction: f.suggestedAction
    }))

    const summaryBullets = parsed.summaryBullets || []
    const recommendedAction = deriveRecommendedAction(findings)
    const reasoning = generateReasoning(findings, recommendedAction)

    // PERSIST: Store the recommendation for feedback loop
    const recommendation = await prisma.aIRecommendation.create({
      data: {
        organizationId,
        messageId,
        taskId: message.taskId,
        campaignType: message.task.campaignType,
        recommendedAction,
        reasoning,
        summaryBullets: summaryBullets as any,
        findings: findings as any,
        model: "gpt-4o-mini",
        promptVersion: PROMPT_VERSION
      }
    })

    return NextResponse.json({
      id: recommendation.id,
      summaryBullets,
      findings,
      recommendedAction,
      reasoning,
      confidence: parsed.confidence || "medium",
      isExisting: false
    })
  } catch (error: any) {
    console.error("[API/review/analyze] Error:", error)
    return NextResponse.json(
      { error: "Failed to analyze message", message: error.message },
      { status: 500 }
    )
  }
}
