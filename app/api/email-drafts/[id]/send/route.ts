import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { EntityService } from "@/lib/services/entity.service"

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
    const { recipients, campaignName } = body

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

    if (!draft.generatedSubject || !draft.generatedBody) {
      return NextResponse.json(
        { error: "Draft not ready" },
        { status: 400 }
      )
    }

    // Resolve recipients
    const recipientList: Array<{ email: string; name?: string }> = []

    if (recipients?.entityIds) {
      for (const entityId of recipients.entityIds) {
        const entity = await EntityService.findById(
          entityId,
          session.user.organizationId
        )
        if (entity?.email) {
          recipientList.push({
            email: entity.email,
            name: entity.firstName
          })
        }
      }
    }

    if (recipients?.groupIds) {
      for (const groupId of recipients.groupIds) {
        const entities = await EntityService.findByOrganization(
          session.user.organizationId,
          { groupId }
        )
        for (const entity of entities) {
          if (entity.email && !recipientList.find(r => r.email === entity.email)) {
            recipientList.push({
              email: entity.email,
              name: entity.firstName
            })
          }
        }
      }
    }

    if (recipientList.length === 0) {
      return NextResponse.json(
        { error: "No valid recipients" },
        { status: 400 }
      )
    }

    // Send emails
    const results = await EmailSendingService.sendBulkEmail({
      organizationId: session.user.organizationId,
      recipients: recipientList,
      subject: draft.generatedSubject,
      body: draft.generatedBody,
      htmlBody: draft.generatedHtmlBody || undefined,
      campaignName: campaignName || draft.suggestedCampaignName || undefined
    })

    // Update draft status
    await EmailDraftService.update(
      params.id,
      session.user.organizationId,
      { status: "SENT" }
    )

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error("Error sending email:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

