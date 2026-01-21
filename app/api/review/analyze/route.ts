import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AttachmentExtractionService } from "@/lib/services/attachment-extraction.service"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

// Current prompt version - increment when prompt changes significantly
const PROMPT_VERSION = "v3" // Bumped for attachment content analysis

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

interface AttachmentSummary {
  filename: string
  documentType: string
  summary: string
  keyDetails: string[]
  accountingRelevance?: string
}

interface AnalysisResult {
  summaryBullets: string[]
  findings: Finding[]
  attachmentSummaries?: AttachmentSummary[]
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
        request: { organizationId }
      },
      include: {
        request: {
          include: {
            entity: true,
            taskInstance: {
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
      // Note: attachmentSummaries not stored in DB, so re-analyze needed for those
      return NextResponse.json({
        id: existingRecommendation.id,
        summaryBullets: existingRecommendation.summaryBullets || [],
        findings: existingRecommendation.findings || [],
        attachmentSummaries: [], // Will trigger re-analysis if user wants document details
        recommendedAction: existingRecommendation.recommendedAction,
        reasoning: existingRecommendation.reasoning,
        confidence: "medium",
        isExisting: true,
        hasAttachments: message.collectedItems.length > 0
      })
    }

    // ============ MEMORY QUERIES ============

    // 1. Full thread (all messages for this request)
    const threadMessages = await prisma.message.findMany({
      where: { requestId: message.requestId },
      orderBy: { createdAt: "asc" },
      select: { direction: true, body: true, subject: true, createdAt: true }
    })

    // 2. Prior AIRecommendations for this request (agreement history)
    // Note: existingRecommendation is null here (we returned early if it existed)
    const priorRecommendations = await prisma.aIRecommendation.findMany({
      where: { 
        requestId: message.requestId
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { recommendedAction: true, humanAction: true, reasoning: true }
    })

    // 3. Contact history (if entity exists) - prior requests with this contact
    let contactHistorySummary = "No prior history with this contact."
    if (message.request.entityId) {
      const contactHistory = await prisma.request.findMany({
        where: { 
          entityId: message.request.entityId, 
          organizationId,
          id: { not: message.requestId } // Exclude current request
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

    // 4. Request/TaskInstance/Board context with deadline
    const taskInstance = message.request.taskInstance
    const board = taskInstance?.board
    const deadline = message.request.deadlineDate || taskInstance?.dueDate

    // ============ BUILD PROMPT CONTEXT ============

    const taskContext = [
      taskInstance ? `Task: "${taskInstance.name}"` : null,
      board ? `Board: "${board.name}"` : null,
      message.request.campaignName ? `Campaign: ${message.request.campaignName}` : null,
      `Deadline: ${formatDate(deadline)}`
    ].filter(Boolean).join(" | ")

    const threadContext = summarizeThread(threadMessages)
    const priorRecsContext = summarizePriorRecommendations(priorRecommendations)

    const currentReplyContext = `
CURRENT REPLY (being analyzed):
From: ${message.fromAddress}
Subject: ${message.subject || "(no subject)"}
Body: ${message.body || "(no body)"}`

    // ============ ATTACHMENT CONTENT EXTRACTION ============
    let attachmentContentContext = ""
    const attachmentMetadataContext = message.collectedItems.length > 0
      ? `Attachments received: ${message.collectedItems.map(a => `${a.filename} (${a.mimeType || "unknown type"}, ${a.fileSize ? Math.round(a.fileSize / 1024) + "KB" : "size unknown"})`).join(", ")}`
      : "No attachments received."

    // Extract content from attachments for AI analysis
    if (message.collectedItems.length > 0) {
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
          
          if (extractionResult.combined.trim()) {
            // Limit content to avoid token limits (first 3000 chars)
            const contentPreview = extractionResult.combined.substring(0, 3000)
            attachmentContentContext = `\n\nATTACHMENT CONTENT (extracted):\n${contentPreview}${extractionResult.combined.length > 3000 ? "\n... (content truncated)" : ""}`
          }
        }
      } catch (extractError: any) {
        console.warn("[API/review/analyze] Attachment extraction failed:", extractError.message)
        attachmentContentContext = "\n\n(Attachment content extraction failed - analyzing metadata only)"
      }
    }

    // ============ AI ANALYSIS ============

    const openai = getOpenAIClient()
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant analyzing business email replies for an accounting team. You have access to MEMORY - historical context about this task and contact. You may also receive EXTRACTED CONTENT from any attachments (PDFs, Excel files, etc.).

Your job is to:
1. Summarize the key points of the current reply (2-3 bullets max)
2. Identify any issues or missing items that need attention
3. Consider the deadline and prior interactions when assessing urgency
4. If attachment content is provided, analyze whether it fulfills the request

For findings, classify severity as:
- "info": Neutral observation, no action needed
- "warning": Potential issue, may need follow-up (e.g., missing document, unclear response, incomplete form)
- "critical": Requires immediate attention (e.g., rejection, deadline risk, wrong document)

When attachment content is available:
- Check if the document type matches what was requested (e.g., W-9, invoice, timesheet)
- Look for missing or incomplete fields
- Verify dates, amounts, or other key data if relevant
- Create an accounting-friendly summary of each document's contents

Use prior AI assessments and human decisions to calibrate your judgment. If humans have consistently disagreed with AI recommendations, be more conservative.

Respond with a JSON object containing:
- summaryBullets: string[] (2-3 key points from the reply)
- findings: array of { severity, title, explanation, suggestedAction? }
- attachmentSummaries: array of { filename, documentType, summary, keyDetails, accountingRelevance? } - one per attachment with content
  - filename: the attachment filename
  - documentType: detected type (e.g., "W-9 Form", "Invoice", "Bank Statement", "Receipt", "PDF Document", "Excel Spreadsheet")
  - summary: 1-2 sentence accounting-friendly summary of what the document contains
  - keyDetails: array of key fields/values found (e.g., "Total Amount: $5,000", "Tax ID: XXX-XX-1234", "Invoice #12345", "Period: Jan 2026")
  - accountingRelevance: optional note about how this relates to typical accounting workflows
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

${attachmentMetadataContext}${attachmentContentContext}

Analyze this reply and provide structured findings. If attachments contain relevant content (like documents, forms, or data), factor that into your analysis of whether the request appears fulfilled.`
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
    const attachmentSummaries: AttachmentSummary[] = (parsed.attachmentSummaries || []).map((s: any) => ({
      filename: s.filename || "Unknown",
      documentType: s.documentType || "Document",
      summary: s.summary || "",
      keyDetails: s.keyDetails || [],
      accountingRelevance: s.accountingRelevance
    }))
    const recommendedAction = deriveRecommendedAction(findings)
    const reasoning = generateReasoning(findings, recommendedAction)

    // PERSIST: Store the recommendation for feedback loop
    const recommendation = await prisma.aIRecommendation.create({
      data: {
        organizationId,
        messageId,
        requestId: message.requestId,
        campaignType: message.request.campaignType,
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
      attachmentSummaries,
      recommendedAction,
      reasoning,
      confidence: parsed.confidence || "medium",
      isExisting: false,
      hasAttachments: message.collectedItems.length > 0
    })
  } catch (error: any) {
    console.error("[API/review/analyze] Error:", error)
    return NextResponse.json(
      { error: "Failed to analyze message", message: error.message },
      { status: 500 }
    )
  }
}
