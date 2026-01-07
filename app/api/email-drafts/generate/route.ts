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
    const { prompt, selectedRecipients } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Create draft record
    const draft = await EmailDraftService.create({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      prompt
    })

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

      return NextResponse.json({
        id: draft.id,
        status: "processing"
      })
    } catch (inngestError: any) {
      // Fallback to synchronous generation if Inngest is not available
      console.warn("Inngest not available, falling back to synchronous generation:", inngestError.message)
      
      const generated = await AIEmailGenerationService.generateDraft({
        organizationId: session.user.organizationId,
        prompt,
        selectedRecipients
      })

      await EmailDraftService.update(draft.id, session.user.organizationId, {
        generatedSubject: generated.subject,
        generatedBody: generated.body,
        generatedHtmlBody: generated.htmlBody,
        suggestedRecipients: generated.suggestedRecipients,
        suggestedCampaignName: generated.suggestedCampaignName,
        suggestedCampaignType: generated.suggestedCampaignType
      })

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
    }
  } catch (error: any) {
    console.error("Error generating draft:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

