import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
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

async function analyzeCompletionPercentage(
  requestSubject: string,
  requestBody: string,
  replySubject: string,
  replyBody: string,
  classification: string,
  hasAttachments: boolean
): Promise<{ completionPercentage: number; confidence: string; reasoning: string }> {
  const openai = getOpenAIClient()
  const requestPreview = requestBody.substring(0, 300)
  const replyPreview = replyBody.substring(0, 500)

  const intentAnalysis = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that analyzes email replies to determine request completion percentage based on intent.

Analyze the reply and assign a completion percentage (0-100) based on:
- 100%: Request is fully completed (e.g., "I just paid the invoice", "I've sent the document", "Payment completed")
- 80-90%: Strong commitment with timeline (e.g., "I'll pay this week", "I'll send it tomorrow", "I'll submit it by Friday")
- 60-79%: Moderate commitment without clear timeline (e.g., "I'll get it done soon", "I'm working on it", "I'll send it when ready")
- 40-59%: Acknowledgment but unclear commitment (e.g., "Got it", "Will do", "I understand")
- 20-39%: Questioning or needs clarification (e.g., "What format do you need?", "Can you clarify?", "Which invoice?")
- 0-19%: No progress or rejection (e.g., "I can't do this", "I don't have it", "Not possible")

Examples:
- "I just paid invoice #12345" → 100% (completed)
- "I'll pay the invoice this week" → 80% (strong commitment with timeline)
- "I'll send it tomorrow" → 85% (strong commitment with specific timeline)
- "I'm working on it, will get back to you" → 65% (moderate commitment, no timeline)
- "Got it, thanks" → 50% (acknowledgment, unclear commitment)
- "What invoice number?" → 25% (questioning/clarification needed)
- "I don't have access to that" → 10% (cannot complete)

Respond with JSON:
{
  "completionPercentage": number (0-100),
  "confidence": "High"/"Medium"/"Low",
  "reasoning": "Brief explanation of why this percentage"
}

Be accurate and realistic - use the full 0-100 scale based on actual intent, not just binary fulfilled/not fulfilled.`
      },
      {
        role: "user",
        content: `Request sent:
Subject: ${requestSubject}
Body: ${requestPreview}

Reply received:
Subject: ${replySubject}
Body: ${replyPreview}
Classification: ${classification}

Has attachments: ${hasAttachments ? "Yes" : "No"}

Analyze the reply intent and determine the completion percentage (0-100) based on what the recipient is indicating.`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 200
  })

  const intentResponse = intentAnalysis.choices[0]?.message?.content
  if (!intentResponse) {
    throw new Error("No response from OpenAI")
  }

  const intentParsed = JSON.parse(intentResponse)
  let completionPercentage = Math.round(intentParsed.completionPercentage || 0)
  const confidence = intentParsed.confidence || "Medium"
  const reasoning = intentParsed.reasoning || "No reasoning provided"

  // Clamp completion percentage to 0-100
  completionPercentage = Math.max(0, Math.min(100, completionPercentage))

  return { completionPercentage, confidence, reasoning }
}

async function backfillCompletionPercentages() {
  console.log("Starting backfill of completion percentages for existing tasks...")

  try {
    // Find all tasks that have inbound messages but no completionPercentage
    const tasksWithReplies = await prisma.task.findMany({
      where: {
        completionPercentage: null,
        messages: {
          some: {
            direction: "INBOUND"
          }
        }
      },
      include: {
        entity: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10 // Get recent messages for context
        }
      }
    })

    console.log(`Found ${tasksWithReplies.length} tasks with replies that need completion percentage analysis`)

    let processed = 0
    let errors = 0

    for (const task of tasksWithReplies) {
      try {
        // Get latest inbound message (reply)
        const latestInboundMessage = task.messages
          .filter(m => m.direction === "INBOUND")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        if (!latestInboundMessage) {
          console.log(`Skipping task ${task.id} - no inbound messages found`)
          continue
        }

        // Get latest outbound message (request)
        const latestOutboundMessage = task.messages.find(m => m.direction === "OUTBOUND")

        if (!latestOutboundMessage) {
          console.log(`Skipping task ${task.id} - no outbound messages found`)
          continue
        }

        // Classify the message if not already classified
        let classification = latestInboundMessage.aiClassification
        if (!classification) {
          console.log(`Classifying message ${latestInboundMessage.id} for task ${task.id}...`)
          const classificationResult = await AIClassificationService.classifyMessage({
            subject: latestInboundMessage.subject || undefined,
            body: latestInboundMessage.body || ""
          })
          classification = classificationResult.classification

          // Update message with classification
          await prisma.message.update({
            where: { id: latestInboundMessage.id },
            data: {
              aiClassification: classification,
              aiReasoning: classificationResult.reasoning
            }
          })
        }

        // Analyze completion percentage
        const requestSubject = latestOutboundMessage.subject || task.campaignName || "Request"
        const requestBody = latestOutboundMessage.body || latestOutboundMessage.htmlBody || ""
        const replySubject = latestInboundMessage.subject || ""
        const replyBody = latestInboundMessage.body || latestInboundMessage.htmlBody || ""

        console.log(`Analyzing completion percentage for task ${task.id}...`)
        const { completionPercentage, confidence, reasoning } = await analyzeCompletionPercentage(
          requestSubject,
          requestBody,
          replySubject,
          replyBody,
          classification,
          task.hasAttachments
        )

        // Adjust for attachments
        let finalCompletionPercentage = completionPercentage
        if (task.hasAttachments && task.aiVerified === true) {
          finalCompletionPercentage = 100
        } else if (task.hasAttachments && task.aiVerified === null && finalCompletionPercentage < 60) {
          finalCompletionPercentage = 60
        }

        // Update task
        const updateData: any = {
          completionPercentage: finalCompletionPercentage,
          aiReasoning: typeof task.aiReasoning === 'object' && task.aiReasoning !== null
            ? { ...(task.aiReasoning as object), completionAnalysis: reasoning }
            : { completionAnalysis: reasoning }
        }

        // If completion is 100% or high confidence 95%+, mark as FULFILLED
        if (finalCompletionPercentage >= 100 || (finalCompletionPercentage >= 95 && confidence === "High")) {
          updateData.status = "FULFILLED"
        }

        await prisma.task.update({
          where: { id: task.id },
          data: updateData
        })

        console.log(`✓ Task ${task.id}: ${finalCompletionPercentage}% complete (${confidence} confidence) - ${reasoning}`)
        processed++

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error: any) {
        console.error(`✗ Error processing task ${task.id}:`, error.message)
        errors++
      }
    }

    console.log(`\nBackfill complete!`)
    console.log(`- Processed: ${processed}`)
    console.log(`- Errors: ${errors}`)
    console.log(`- Total: ${tasksWithReplies.length}`)

    return { processed, errors, total: tasksWithReplies.length }
  } catch (error: any) {
    console.error("Fatal error during backfill:", error)
    throw error
  }
  // Note: Don't disconnect Prisma here - it's managed by the framework in API routes
}

/**
 * Admin API endpoint to trigger backfill of completion percentages for existing tasks
 * 
 * This endpoint processes all tasks that have replies but don't have a completionPercentage
 * set yet, analyzing the latest reply with LLM to determine completion percentage.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Only allow admins to run this
  // You can add role checking here if needed
  // if (session.user.role !== "ADMIN") {
  //   return NextResponse.json(
  //     { error: "Forbidden - Admin only" },
  //     { status: 403 }
  //   )
  // }

  try {
    console.log("Starting backfill of completion percentages via API...")
    
    // Run the backfill (this will process all tasks)
    const result = await backfillCompletionPercentages()
    
    return NextResponse.json({
      success: true,
      message: "Backfill completed successfully",
      ...result
    })
  } catch (error: any) {
    console.error("Error running backfill:", error)
    return NextResponse.json(
      { 
        error: "Backfill failed",
        message: error.message 
      },
      { status: 500 }
    )
  }
}

