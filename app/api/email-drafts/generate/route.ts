import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { prisma } from "@/lib/prisma"
import { resolveRecipientsWithFilter, buildRecipientPersonalizationData } from "@/lib/services/recipient-filter.service"
import { checkRateLimit } from "@/lib/utils/rate-limit"

export const maxDuration = 30
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now()
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Check rate limit
  const rateLimitResult = checkRateLimit(session.user.organizationId)
  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)
    return NextResponse.json(
      { 
        error: "Rate limit exceeded. Please wait before generating more drafts.",
        retryAfterSeconds
      },
      { 
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds)
        }
      }
    )
  }

  try {
    const body = await request.json()
    const {
      prompt,
      selectedRecipients,
      idempotencyKey,
      requestName,
      personalizationMode,
      availableTags: providedTags,
      blockOnMissingValues,
      deadlineDate
    } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    const recipientsWithFilter = selectedRecipients
      ? {
          ...selectedRecipients,
          stateFilter: selectedRecipients.stateFilter || body.stateFilter || undefined
        }
      : undefined

    // Validate recipients in request mode (only for contact mode, not CSV mode)
    if (requestName && recipientsWithFilter && personalizationMode !== "csv") {
      const entityIds = recipientsWithFilter.entityIds || []
      const contactTypes = recipientsWithFilter.contactTypes || []
      // Stakeholders = individual contacts OR contact types (groups are optional filter)
      if (entityIds.length === 0 && contactTypes.length === 0) {
        return NextResponse.json(
          { error: "At least one contact or type must be selected as stakeholder" },
          { status: 400 }
        )
      }
    }

    // Resolve recipients early to derive available tags from data personalization fields
    let resolvedRecipients: Awaited<ReturnType<typeof resolveRecipientsWithFilter>> | null = null
    let derivedTags: string[] = providedTags || []
    
    if (recipientsWithFilter && personalizationMode === "contact") {
      resolvedRecipients = await resolveRecipientsWithFilter(
        session.user.organizationId,
        recipientsWithFilter
      )
      
      // Get selected data field keys - support both single key and multiple keys
      const selectedKeys = recipientsWithFilter.stateFilter?.stateKeys?.length 
        ? recipientsWithFilter.stateFilter.stateKeys 
        : recipientsWithFilter.stateFilter?.stateKey 
          ? [recipientsWithFilter.stateFilter.stateKey]
          : []
      
      // Start with base contact fields
      const dataKeys = new Set<string>(["First Name", "Email"])
      
      // Add selected data personalization fields as available tags
      // (even if no recipients, so LLM knows what fields to use)
      for (const key of selectedKeys) {
        dataKeys.add(key)
      }
      
      // If we have recipients, also derive tags from their actual contact state metadata
      if (selectedKeys.length > 0 && resolvedRecipients.recipients.length > 0) {
        for (const recipient of resolvedRecipients.recipients) {
          const data = buildRecipientPersonalizationData(recipient)
          for (const key of Object.keys(data)) {
            dataKeys.add(key)
          }
        }
      }
      
      derivedTags = Array.from(dataKeys)
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
    
    // Use derived tags from slice data (contact mode) or provided tags (CSV mode)
    const tagsForGeneration = derivedTags.length > 0 ? derivedTags : (providedTags || undefined)
    
    // AI service now always returns (template fallback on timeout/error), never throws
    const generated = await AIEmailGenerationService.generateDraft({
      organizationId: session.user.organizationId,
      prompt,
      selectedRecipients: recipientsWithFilter,
      correlationId: correlationId, // Use original correlationId for tracing
      senderName: user?.name || undefined,
      senderEmail: user?.email || undefined,
      senderCompany: user?.organization?.name || undefined,
      availableTags: tagsForGeneration,
      personalizationMode: personalizationMode || undefined,
      deadlineDate: deadlineDate ? new Date(deadlineDate) : null
    })
    const aiEndTime = Date.now()

    // Use requestName if provided, otherwise use AI-suggested campaign name
    const finalCampaignName = requestName?.trim() || generated.suggestedCampaignName
    
    // Use templates if available, otherwise use regular generated fields
    const subjectTemplate = generated.subjectTemplate || generated.subject
    const bodyTemplate = generated.bodyTemplate || generated.body
    const htmlBodyTemplate = generated.htmlBodyTemplate || generated.htmlBody

    const dbUpdateStartTime = Date.now()
    
    // Use already-resolved recipients if available, otherwise resolve now
    const recipientStats =
      requestName && recipientsWithFilter && personalizationMode !== "csv"
        ? (resolvedRecipients || await resolveRecipientsWithFilter(session.user.organizationId, recipientsWithFilter))
        : null

    await EmailDraftService.update(draft.id, session.user.organizationId, {
      generatedSubject: generated.subject,
      generatedBody: generated.body,
      generatedHtmlBody: generated.htmlBody,
      subjectTemplate: subjectTemplate || null,
      bodyTemplate: bodyTemplate || null,
      htmlBodyTemplate: htmlBodyTemplate || null,
      availableTags: tagsForGeneration || null,
      personalizationMode: personalizationMode || null,
      blockOnMissingValues: blockOnMissingValues ?? true,
      deadlineDate: deadlineDate ? new Date(deadlineDate) : null,
      suggestedRecipients: recipientsWithFilter || generated.suggestedRecipients,
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
                subjectTemplate: subjectTemplate || generated.subject,
                bodyTemplate: bodyTemplate || generated.body,
                htmlBodyTemplate: htmlBodyTemplate || generated.htmlBody,
                suggestedRecipients: selectedRecipients || generated.suggestedRecipients,
                suggestedCampaignName: finalCampaignName,
                suggestedCampaignType: generated.suggestedCampaignType,
                availableTags: tagsForGeneration
              },
              recipientStats: recipientStats ? recipientStats.counts : undefined
            })
  } catch (error: any) {
    console.error("Error generating draft:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

