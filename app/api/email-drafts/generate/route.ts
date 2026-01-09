import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { inngest } from "@/inngest/client"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { prompt, selectedRecipients, idempotencyKey } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    const correlationId = idempotencyKey || `gen-${Date.now()}-${Math.random().toString(36).substring(7)}`

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
    try {
      draft = await EmailDraftService.create({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        prompt,
        idempotencyKey: idempotencyKey || null,
        aiGenerationStatus: "processing"
      })
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

    console.log(JSON.stringify({
      event: "draft_created",
      correlationId,
      draftId: draft.id,
      organizationId: session.user.organizationId,
      timestamp: new Date().toISOString()
    }))

    // Try to use Inngest for async generation, fallback to sync if it fails
    try {
      await inngest.send({
        name: "email-draft/generate",
        data: {
          draftId: draft.id,
          organizationId: session.user.organizationId,
          prompt,
          selectedRecipients
        }
      })

      console.log(JSON.stringify({
        event: "draft_generate_async",
        correlationId,
        draftId: draft.id,
        timestamp: new Date().toISOString()
      }))

      return NextResponse.json({
        id: draft.id,
        status: "processing"
      })
    } catch (inngestError: any) {
      // Fallback to synchronous generation if Inngest is not available
      console.log(JSON.stringify({
        event: "draft_generate_sync_fallback",
        correlationId,
        draftId: draft.id,
        reason: inngestError.message,
        timestamp: new Date().toISOString()
      }))
      
      try {
        const generated = await AIEmailGenerationService.generateDraft({
          organizationId: session.user.organizationId,
          prompt,
          selectedRecipients,
          correlationId
        })

        await EmailDraftService.update(draft.id, session.user.organizationId, {
          generatedSubject: generated.subject,
          generatedBody: generated.body,
          generatedHtmlBody: generated.htmlBody,
          suggestedRecipients: generated.suggestedRecipients,
          suggestedCampaignName: generated.suggestedCampaignName,
          suggestedCampaignType: generated.suggestedCampaignType,
          aiGenerationStatus: "complete"
        })

        console.log(JSON.stringify({
          event: "draft_generate_complete",
          correlationId,
          draftId: draft.id,
          timestamp: new Date().toISOString()
        }))

        return NextResponse.json({
          id: draft.id,
          status: "completed",
          draft: {
            generatedSubject: generated.subject,
            generatedBody: generated.body,
            generatedHtmlBody: generated.htmlBody,
            suggestedRecipients: generated.suggestedRecipients,
            suggestedCampaignName: generated.suggestedCampaignName,
            suggestedCampaignType: generated.suggestedCampaignType
          }
        })
      } catch (aiError: any) {
        const isTimeout = aiError.code === "AI_TIMEOUT"
        const finalStatus = isTimeout ? "timeout" : "failed"
        
        await EmailDraftService.update(draft.id, session.user.organizationId, {
          aiGenerationStatus: finalStatus
        })

        console.log(JSON.stringify({
          event: "draft_generate_failed",
          correlationId,
          draftId: draft.id,
          error: aiError.message,
          code: aiError.code,
          retryable: aiError.retryable,
          timestamp: new Date().toISOString()
        }))

        // Return draft ID even on failure so user can still use it
        return NextResponse.json({
          id: draft.id,
          status: "failed",
          error: aiError.message,
          retryable: aiError.retryable
        })
      }
    }
  } catch (error: any) {
    console.error("Error generating draft:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

