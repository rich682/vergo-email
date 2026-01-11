import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { ScheduleCreationService } from "@/lib/services/schedule-creation.service"
import { EntityService } from "@/lib/services/entity.service"
import { GroupService } from "@/lib/services/group.service"

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
    const { scheduleDateTime, groupId, scheduleName } = body

    // Validate inputs
    if (!scheduleDateTime) {
      return NextResponse.json(
        { error: "Schedule date/time is required" },
        { status: 400 }
      )
    }

    if (!groupId) {
      return NextResponse.json(
        { error: "Group ID is required" },
        { status: 400 }
      )
    }

    if (!scheduleName) {
      return NextResponse.json(
        { error: "Schedule name is required" },
        { status: 400 }
      )
    }

    // Parse and validate date/time
    const scheduleDate = new Date(scheduleDateTime)
    if (isNaN(scheduleDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date/time format" },
        { status: 400 }
      )
    }

    const validation = ScheduleCreationService.validateScheduleDateTime(scheduleDate)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // Get draft
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

    // Verify group exists and belongs to organization
    const group = await GroupService.findById(groupId, session.user.organizationId)
    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    // Create schedule
    const schedule = await ScheduleCreationService.createScheduleFromDraft({
      organizationId: session.user.organizationId,
      draftId: params.id,
      scheduleDateTime: scheduleDate,
      groupId,
      scheduleName,
      emailSubject: draft.generatedSubject,
      emailBody: draft.generatedBody,
      htmlBody: draft.generatedHtmlBody || undefined,
      campaignName: draft.suggestedCampaignName || undefined,
      timezone: "UTC" // Default to UTC, can be enhanced later
    })

    // Update draft status to APPROVED (not SENT, since it's scheduled)
    await EmailDraftService.update(
      params.id,
      session.user.organizationId,
      { status: "APPROVED" }
    )

    return NextResponse.json({
      success: true,
      schedule: {
        id: schedule.id,
        nextRunAt: schedule.nextRunAt
      }
    })
  } catch (error: any) {
    console.error("Error creating schedule:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}











