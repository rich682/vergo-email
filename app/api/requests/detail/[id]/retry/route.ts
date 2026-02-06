/**
 * Retry sending a failed request
 * 
 * POST /api/requests/detail/[id]/retry
 * 
 * Only works for requests with SEND_FAILED status.
 * Attempts to resend the email and updates the request status accordingly.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EmailSendingService } from "@/lib/services/email-sending.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: requestId } = await params
    const organizationId = session.user.organizationId

    // Fetch the failed request
    const failedRequest = await prisma.request.findFirst({
      where: {
        id: requestId,
        organizationId,
        status: "SEND_FAILED",
      },
      include: {
        entity: true,
        taskInstance: true,
      },
    })

    if (!failedRequest) {
      return NextResponse.json(
        { error: "Request not found or not in SEND_FAILED status" },
        { status: 404 }
      )
    }

    if (!failedRequest.entity?.email) {
      return NextResponse.json(
        { error: "No email address found for recipient" },
        { status: 400 }
      )
    }

    // Get the original outbound message to reconstruct the email
    const originalMessage = await prisma.message.findFirst({
      where: {
        requestId: failedRequest.id,
        direction: "OUTBOUND",
      },
      orderBy: { createdAt: "desc" },
    })

    // Build subject and body from original message or from request data
    const subject = originalMessage?.subject ||
      failedRequest.campaignName ||
      "Request"
    const body = originalMessage?.body || "Please review and respond to this request."
    const htmlBody = originalMessage?.htmlBody || body.replace(/\n/g, "<br>")

    console.log(`[RetryRequest] Retrying send for request ${requestId} to ${failedRequest.entity.email}`)

    try {
      // Attempt to resend
      const sendResult = await EmailSendingService.sendEmail({
        organizationId,
        userId: session.user.id,
        jobId: failedRequest.taskInstanceId || undefined,
        to: failedRequest.entity.email,
        toName: failedRequest.entity.firstName || undefined,
        subject,
        body,
        htmlBody,
        campaignName: failedRequest.campaignName || undefined,
        requestType: failedRequest.requestType || "standard",
        skipRateLimit: true, // Retries should bypass rate limiting
      })

      // Delete the old failed request since a new one was created by sendEmail
      await prisma.request.delete({
        where: { id: requestId },
      })

      console.log(`[RetryRequest] Retry successful for ${failedRequest.entity.email}, new request: ${sendResult.taskId}`)

      return NextResponse.json({
        success: true,
        newRequestId: sendResult.taskId,
        message: `Email successfully resent to ${failedRequest.entity.email}`,
      })
    } catch (sendError: any) {
      console.error(`[RetryRequest] Retry failed for ${failedRequest.entity.email}:`, sendError.message)

      // Update the failed request with the new error
      const prevReasoning = failedRequest.aiReasoning as Record<string, unknown> || {}
      await prisma.request.update({
        where: { id: requestId },
        data: {
          aiReasoning: {
            ...prevReasoning,
            retryError: sendError.message,
            retryAt: new Date().toISOString(),
            retryCount: ((prevReasoning.retryCount as number) || 0) + 1,
          },
        },
      })

      return NextResponse.json(
        {
          success: false,
          error: sendError.message,
          message: `Retry failed: ${sendError.message}`,
        },
        { status: 502 }
      )
    }
  } catch (error: any) {
    console.error("[RetryRequest] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    )
  }
}
