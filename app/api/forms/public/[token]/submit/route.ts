/**
 * Public Form Submission API
 *
 * POST /api/forms/public/[token]/submit
 * Handles submissions from universal form links (no auth required).
 * Routes responses to the correct task based on the accounting period date.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { FormNotificationService } from "@/lib/services/form-notification.service"
import type { FormField, FormSettings } from "@/lib/types/form"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // 1. Validate token and fetch form definition
    const formDef = await prisma.formDefinition.findFirst({
      where: {
        universalAccessToken: token,
        universalLinkEnabled: true,
        deletedAt: null,
      },
      include: {
        organization: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    })

    if (!formDef) {
      return NextResponse.json(
        { error: "Form not found or link is disabled" },
        { status: 404 }
      )
    }

    // 2. Parse fields and response data
    const fields = (formDef.fields || []) as unknown as FormField[]
    const body = await request.json()
    const { responseData, submitterName, submitterEmail } = body

    if (!responseData || typeof responseData !== "object") {
      return NextResponse.json(
        { error: "Response data is required" },
        { status: 400 }
      )
    }

    // 3. Validate required fields
    const errors: Record<string, string> = {}
    for (const field of fields) {
      if (field.required) {
        const value = responseData[field.key]
        if (value === null || value === undefined || value === "") {
          errors[field.key] = `${field.label} is required`
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    // 4. Extract accounting period date
    const accountingPeriodField = fields.find(f => f.type === "accountingPeriod")
    if (!accountingPeriodField) {
      return NextResponse.json(
        { error: "This form requires an Accounting Period field" },
        { status: 400 }
      )
    }

    const accountingPeriodValue = responseData[accountingPeriodField.key]
    if (!accountingPeriodValue || typeof accountingPeriodValue !== "string") {
      return NextResponse.json(
        { error: "Accounting period date is required" },
        { status: 400 }
      )
    }

    // Parse the date (YYYY-MM-DD format)
    const periodDate = new Date(accountingPeriodValue + "T00:00:00Z")
    if (isNaN(periodDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid accounting period date" },
        { status: 400 }
      )
    }

    // 5. Find the board that contains this date
    const board = await prisma.board.findFirst({
      where: {
        organizationId: formDef.organizationId,
        periodStart: { lte: periodDate },
        periodEnd: { gt: periodDate },
      },
    })

    if (!board) {
      return NextResponse.json(
        { error: "No accounting period found for the selected date. Please select a valid date." },
        { status: 404 }
      )
    }

    // 6. Find the task in that board linked to this form
    const taskInstance = await prisma.taskInstance.findFirst({
      where: {
        boardId: board.id,
        formDefinitionId: formDef.id,
        organizationId: formDef.organizationId,
        deletedAt: null,
      },
    })

    if (!taskInstance) {
      return NextResponse.json(
        { error: "No task is set up to receive responses for this form in the selected accounting period. Please contact your administrator." },
        { status: 404 }
      )
    }

    // 7. Compute database row index if form has a linked database
    let databaseRowIndex: number | null = null
    if (formDef.databaseId) {
      const db = await prisma.database.findUnique({
        where: { id: formDef.databaseId },
        select: { rowCount: true },
      })
      databaseRowIndex = (db?.rowCount || 0)

      // Insert row into database
      const columnMapping = (formDef.columnMapping || {}) as Record<string, string>
      const rowData: Record<string, unknown> = {}
      for (const field of fields) {
        const colKey = columnMapping[field.key] || field.key
        rowData[colKey] = responseData[field.key] ?? null
      }

      await prisma.database.update({
        where: { id: formDef.databaseId },
        data: {
          rowCount: { increment: 1 },
          rows: {
            push: rowData,
          },
        } as any,
      })
    }

    // 8. Create FormRequest with SUBMITTED status
    const formRequest = await prisma.formRequest.create({
      data: {
        organizationId: formDef.organizationId,
        taskInstanceId: taskInstance.id,
        formDefinitionId: formDef.id,
        status: "SUBMITTED",
        customStatus: "Submitted",
        submittedAt: new Date(),
        responseData: responseData as any,
        databaseRowIndex,
        remindersEnabled: false,
        remindersSent: 0,
        remindersMaxCount: 0,
        reminderFrequencyHours: 0,
      },
    })

    // 9. Send owner notification (non-blocking)
    FormNotificationService.sendOwnerSubmissionNotification({
      formRequestId: formRequest.id,
      formName: formDef.name,
      taskName: taskInstance.name,
      submitterName: submitterName || "Anonymous",
      submitterEmail: submitterEmail || null,
      organizationId: formDef.organizationId,
      ownerEmail: formDef.createdBy.email,
      ownerName: formDef.createdBy.name,
      taskInstanceId: taskInstance.id,
    }).catch(err => console.error("Failed to send owner notification:", err))

    return NextResponse.json({
      success: true,
      formRequestId: formRequest.id,
      message: "Form submitted successfully",
    })
  } catch (error: any) {
    console.error("Error processing public form submission:", error)
    return NextResponse.json(
      { error: "Failed to submit form" },
      { status: 500 }
    )
  }
}
