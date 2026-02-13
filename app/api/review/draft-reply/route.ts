import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import OpenAI from "openai"

export const maxDuration = 30
export const dynamic = "force-dynamic"

// Draft prompt version - increment when prompt changes significantly
const DRAFT_PROMPT_VERSION = "v1"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
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
 * Analyze tone from prior outbound emails
 */
function analyzeTone(messages: Array<{ body: string | null }>): string {
  if (messages.length === 0) return "professional"
  
  const bodies = messages.map(m => m.body || "").join(" ").toLowerCase()
  
  // Simple heuristics for tone
  const formalIndicators = ["sincerely", "regards", "best regards", "please find", "kindly", "pursuant"]
  const casualIndicators = ["hey", "hi there", "thanks!", "cheers", "catch you", "let me know"]
  
  let formalScore = formalIndicators.filter(i => bodies.includes(i)).length
  let casualScore = casualIndicators.filter(i => bodies.includes(i)).length
  
  if (casualScore > formalScore) return "friendly and concise"
  return "professional and polite"
}

/**
 * POST /api/review/draft-reply
 * Generate a memory-aware draft reply for a message
 * 
 * Request: { messageId: string, regenerate?: boolean }
 * Response: { draft: string, isExisting: boolean, recommendationId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id

    if (!canPerformAction(session.user.role, "inbox:manage_drafts", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create drafts" }, { status: 403 })
    }

    const body = await request.json()
    const { messageId, regenerate = false } = body

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      )
    }

    // Fetch user's signature for appending to draft
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, signature: true }
    })
    
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })
    
    // Build signature - use custom if available, otherwise build from user/org data
    let userSignature = ""
    if (user?.signature && user.signature.trim() !== "") {
      userSignature = user.signature
    } else {
      // Build fallback signature from user/org data
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (organization?.name) signatureParts.push(organization.name)
      if (signatureParts.length > 0) {
        userSignature = signatureParts.join("\n")
      }
    }

    // Fetch the message with context
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
                board: { select: { name: true } }
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

    // Find latest AIRecommendation for this message
    const recommendation = await prisma.aIRecommendation.findFirst({
      where: { messageId },
      orderBy: { createdAt: "desc" }
    })

    if (!recommendation) {
      return NextResponse.json(
        { error: "No AI recommendation found. Call /api/review/analyze first." },
        { status: 400 }
      )
    }

    // IDEMPOTENCY: Return cached draft if exists and not regenerating
    if (!regenerate && recommendation.draftReply && recommendation.draftPromptVersion === DRAFT_PROMPT_VERSION) {
      return NextResponse.json({
        draft: recommendation.draftReply,
        isExisting: true,
        recommendationId: recommendation.id
      })
    }

    // ============ MEMORY QUERIES FOR DRAFT ============

    // 1. All thread messages for context
    const threadMessages = await prisma.message.findMany({
      where: { requestId: message.requestId },
      orderBy: { createdAt: "asc" },
      select: { direction: true, body: true, subject: true }
    })

    // 2. Prior outbound messages for tone analysis
    const priorOutbound = await prisma.message.findMany({
      where: {
        request: { organizationId },
        direction: "OUTBOUND"
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { body: true }
    })

    // 3. Prior AIRecommendations with findings
    const priorRecs = await prisma.aIRecommendation.findMany({
      where: { requestId: message.requestId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { recommendedAction: true, findings: true, reasoning: true }
    })

    // ============ BUILD CONTEXT ============

    const tone = analyzeTone(priorOutbound)
    const deadline = message.request.deadlineDate || message.request.taskInstance?.dueDate
    const recipientName = message.request.entity?.firstName || message.fromAddress.split("@")[0]
    
    // Get the original request for context
    const originalRequest = threadMessages.find(m => m.direction === "OUTBOUND")
    const originalRequestBody = originalRequest?.body || ""

    // Extract findings for follow-up items
    const findings = (recommendation.findings as any[]) || []
    const missingItems = findings
      .filter(f => f.severity === "warning" || f.severity === "critical")
      .map(f => f.title)

    // Attachment context
    const attachments = message.collectedItems.map(a => a.filename).join(", ")

    // ============ GENERATE DRAFT ============

    const openai = getOpenAIClient()

    // Determine draft type based on recommendation
    const isFollowUp = recommendation.recommendedAction === "NEEDS_FOLLOW_UP"
    
    const systemPrompt = `You are drafting a ${tone} email reply for an accounting professional.

Rules:
- Keep it SHORT (3-5 sentences max)
- Be direct and specific
- Reference the deadline if follow-up is needed
- Do NOT use generic phrases like "I hope this email finds you well"
- If attachments were received, acknowledge them specifically
- If items are missing, list them clearly
- Match the tone of prior emails from this organization
- Do NOT include a signature - end with just "Best regards" or similar closing (signature will be added automatically)`

    const userPrompt = isFollowUp 
      ? `The recipient replied but we need to follow up for missing items.

Original request: ${originalRequestBody.substring(0, 300)}
Their reply: ${message.body?.substring(0, 500) || "(empty)"}
Attachments received: ${attachments || "None"}
Missing items: ${missingItems.join(", ") || "Unclear response"}
Deadline: ${formatDate(deadline)}

Draft a polite follow-up asking for the missing items. Reference the deadline if it's approaching.`
      : `The recipient replied and everything looks good.

Original request: ${originalRequestBody.substring(0, 300)}
Their reply: ${message.body?.substring(0, 500) || "(empty)"}
Attachments received: ${attachments || "None"}

Draft a brief thank-you acknowledgment. Keep it to 1-2 sentences.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 300
    })

    let draft = completion.choices[0]?.message?.content?.trim() || 
      (isFollowUp 
        ? `Hi ${recipientName},\n\nThank you for your response. Could you please provide the missing items at your earliest convenience?\n\nBest regards`
        : `Hi ${recipientName},\n\nThank you for sending this over. I've received everything.\n\nBest regards`)

    // Append user signature if available
    if (userSignature) {
      // Clean up the draft ending and add signature
      // Remove any trailing "Best regards" variations without a name
      draft = draft.replace(/\n*(Best regards|Kind regards|Regards|Thanks|Thank you),?\s*$/i, "")
      draft = draft.trim() + "\n\nBest regards,\n" + userSignature
    }

    // ============ PERSIST DRAFT ============

    await prisma.aIRecommendation.update({
      where: { id: recommendation.id },
      data: {
        draftReply: draft,
        draftPromptVersion: DRAFT_PROMPT_VERSION
      }
    })

    return NextResponse.json({
      draft,
      isExisting: false,
      recommendationId: recommendation.id
    })
  } catch (error: any) {
    console.error("[API/review/draft-reply] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    )
  }
}
