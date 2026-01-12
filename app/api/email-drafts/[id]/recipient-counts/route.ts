import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { resolveRecipientsWithFilter } from "@/lib/services/recipient-filter.service"
import { PersonalizationDataService } from "@/lib/services/personalization-data.service"
import { EmailDraftService } from "@/lib/services/email-draft.service"

/**
 * POST /api/email-drafts/[id]/recipient-counts
 * Returns recipient counts for send confirmation dialog
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { recipients: recipientsPayload } = body

    // Verify draft exists and belongs to org
    const draft = await EmailDraftService.findById(
      params.id,
      session.user.organizationId
    )

    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    const personalizationMode = (draft as any).personalizationMode || "none"

    // For CSV mode, get counts from personalization data
    if (personalizationMode === "csv") {
      const personalizationData = await PersonalizationDataService.findByDraftId(params.id)
      
      const validRecipients = personalizationData.filter(p => p.recipientEmail && p.recipientEmail.includes("@"))
      const invalidRecipients = personalizationData.filter(p => !p.recipientEmail || !p.recipientEmail.includes("@"))
      
      return NextResponse.json({
        totalRecipients: personalizationData.length,
        includedRecipients: validRecipients.length,
        excludedRecipients: invalidRecipients.length,
        excludedReasons: invalidRecipients.length > 0 
          ? [{ reason: "Invalid or missing email address", count: invalidRecipients.length }]
          : [],
        recipientEmails: validRecipients.slice(0, 5).map(p => p.recipientEmail)
      })
    }

    // For contact mode, resolve recipients
    let selectedRecipients = recipientsPayload ?? (draft as any).suggestedRecipients ?? {}
    if (typeof selectedRecipients === "string") {
      try {
        selectedRecipients = JSON.parse(selectedRecipients)
      } catch {
        selectedRecipients = {}
      }
    }

    const resolved = await resolveRecipientsWithFilter(session.user.organizationId, selectedRecipients)
    
    // Calculate exclusion reasons
    const excludedReasons: Array<{ reason: string; count: number }> = []
    
    if (resolved.excludedCount > 0) {
      // Check for missing emails
      const missingEmailCount = resolved.excludedCount // Default assumption
      if (missingEmailCount > 0) {
        excludedReasons.push({ reason: "Missing email address", count: missingEmailCount })
      }
    }

    // Check for filter exclusions
    if (selectedRecipients.stateFilter?.stateKeys?.length > 0 && selectedRecipients.stateFilter?.mode === "has") {
      const filterExcluded = resolved.excludedCount
      if (filterExcluded > 0 && !excludedReasons.some(r => r.reason.includes("Missing email"))) {
        excludedReasons.push({ reason: "Missing required data fields", count: filterExcluded })
      }
    }

    return NextResponse.json({
      totalRecipients: resolved.totalCount,
      includedRecipients: resolved.recipients.length,
      excludedRecipients: resolved.excludedCount,
      excludedReasons,
      recipientEmails: resolved.recipients.slice(0, 5).map(r => r.email)
    })
  } catch (error: any) {
    console.error("Error getting recipient counts:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
