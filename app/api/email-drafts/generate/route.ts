import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now()
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { prompt, selectedRecipients, idempotencyKey, requestName } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Validate recipients in request mode (if requestName is provided, treat as request mode)
    if (requestName && selectedRecipients) {
      const entityIds = selectedRecipients.entityIds || []
      const groupIds = selectedRecipients.groupIds || []
      if (entityIds.length === 0 && groupIds.length === 0) {
        return NextResponse.json(
          { error: "At least one contact or group must be selected" },
          { status: 400 }
        )
      }
    }

    const correlationId = idempotencyKey || `gen-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    // Execution path: Synchronous generation by default for < 2s completion
    // Inngest async path removed - no handler exists, would cause stuck "processing" state
    
    console.log(JSON.stringify({
      event: "draft_generate_request",
      correlationId,
      idempotencyKey: idempotencyKey || null,
      requestTime: requestStartTime,
      timestamp: new Date().toISOString()
    }))

    // Race-safe idempotency: try create, catch unique constraint, then fetch existing
    let draft
    if (idempotencyKey) {
      const existing = await EmailDraftService.findByIdempotencyKey(
        idempotencyKey,
        session.user.organizationId
      )
      
      if (existing) {
        console.log(JSON.stringify({
          event: "draft_generate_idempotent",
          correlationId,
          draftId: existing.id,
          status: existing.status,
          timestamp: new Date().toISOString()
        }))
        
        return NextResponse.json({
          id: existing.id,
          status: existing.generatedSubject ? "completed" : "processing",
          draft: existing.generatedSubject ? {
            generatedSubject: existing.generatedSubject,
            generatedBody: existing.generatedBody,
            generatedHtmlBody: existing.generatedHtmlBody,
            suggestedRecipients: existing.suggestedRecipients,
            suggestedCampaignName: existing.suggestedCampaignName,
            suggestedCampaignType: existing.suggestedCampaignType
          } : undefined
        })
      }
    }

    // Create draft record (race-safe: unique constraint will catch concurrent duplicates)
    const draftCreateStartTime = Date.now()
    try {
      draft = await EmailDraftService.create({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        prompt,
        idempotencyKey: idempotencyKey || null,
        aiGenerationStatus: "processing" // Will be set to "complete" immediately after generation
      })
      const draftCreateEndTime = Date.now()
    } catch (createError: any) {
      // Handle unique constraint violation ONLY if it's for idempotencyKey
      if (createError.code === 'P2002' && idempotencyKey) {
        // Verify the constraint target is idempotencyKey (Prisma error metadata)
        const target = createError.meta?.target
        const isIdempotencyConstraint = Array.isArray(target) && target.includes('idempotencyKey')
        
        if (isIdempotencyConstraint) {
          const existing = await EmailDraftService.findByIdempotencyKey(
            idempotencyKey,
            session.user.organizationId
          )
          
          if (existing) {
            console.log(JSON.stringify({
              event: "draft_generate_idempotent_race",
              correlationId,
              draftId: existing.id,
              timestamp: new Date().toISOString()
            }))
            
            return NextResponse.json({
              id: existing.id,
              status: existing.generatedSubject ? "completed" : "processing",
              draft: existing.generatedSubject ? {
                generatedSubject: existing.generatedSubject,
                generatedBody: existing.generatedBody,
                generatedHtmlBody: existing.generatedHtmlBody,
                suggestedRecipients: existing.suggestedRecipients,
                suggestedCampaignName: existing.suggestedCampaignName,
                suggestedCampaignType: existing.suggestedCampaignType
              } : undefined
            })
          }
        }
        // P2002 for non-idempotency constraint: rethrow as 500
        console.error(JSON.stringify({
          event: "draft_create_constraint_error",
          correlationId,
          error: createError.message,
          target: target,
          timestamp: new Date().toISOString()
        }))
        return NextResponse.json(
          { error: "Database constraint violation", code: "CONSTRAINT_ERROR" },
          { status: 500 }
        )
      }
      throw createError
    }

    const draftCreateEndTime = Date.now()
    console.log(JSON.stringify({
      event: "draft_created",
      correlationId,
      draftId: draft.id,
      idempotencyKey: idempotencyKey || null,
      organizationId: session.user.organizationId,
      draftCreateTimeMs: draftCreateEndTime - draftCreateStartTime,
      timestamp: new Date().toISOString()
    }))

    // Get user info for signature
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true }
    })

    // Synchronous generation path (default) - no Inngest handler exists
    // This ensures < 2s completion in normal conditions with deterministic fallback
    const aiStartTime = Date.now()
    // AI service now always returns (template fallback on timeout/error), never throws
    const generated = await AIEmailGenerationService.generateDraft({
      organizationId: session.user.organizationId,
      prompt,
      selectedRecipients,
      correlationId: correlationId, // Use original correlationId for tracing
      senderName: user?.name || undefined,
      senderEmail: user?.email || undefined,
      senderCompany: user?.organization?.name || undefined
    })
    const aiEndTime = Date.now()

    // Use requestName if provided, otherwise use AI-suggested campaign name
    const finalCampaignName = requestName?.trim() || generated.suggestedCampaignName
    
    const dbUpdateStartTime = Date.now()
    await EmailDraftService.update(draft.id, session.user.organizationId, {
      generatedSubject: generated.subject,
      generatedBody: generated.body,
      generatedHtmlBody: generated.htmlBody,
      suggestedRecipients: selectedRecipients || generated.suggestedRecipients,
      suggestedCampaignName: finalCampaignName,
      suggestedCampaignType: generated.suggestedCampaignType,
      aiGenerationStatus: "complete" // Always complete (template fallback is still "complete")
    })
    const dbUpdateEndTime = Date.now()
    const responseTime = Date.now()

    console.log(JSON.stringify({
      event: "draft_generate_complete",
      correlationId,
      idempotencyKey: idempotencyKey || null,
      draftId: draft.id,
      aiTimeMs: aiEndTime - aiStartTime,
      dbUpdateTimeMs: dbUpdateEndTime - dbUpdateStartTime,
      totalTimeMs: responseTime - requestStartTime,
      timestamp: new Date().toISOString()
    }))

    return NextResponse.json({
      id: draft.id,
      status: "completed",
      draft: {
        generatedSubject: generated.subject,
        generatedBody: generated.body,
        generatedHtmlBody: generated.htmlBody,
        suggestedRecipients: selectedRecipients || generated.suggestedRecipients,
        suggestedCampaignName: finalCampaignName,
        suggestedCampaignType: generated.suggestedCampaignType
      }
    })
  } catch (error: any) {
    console.error("Error generating draft:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

