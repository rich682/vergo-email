import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computeDeterministicRisk, computeLastActivityAt } from "@/lib/services/risk-computation.service"
import { createHash } from "crypto"
import { checkRateLimit } from "@/lib/utils/rate-limit"

// 1x1 transparent PNG pixel (reused across all responses)
const TRANSPARENT_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const PIXEL_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
} as const

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Rate limit by IP to prevent abuse (generous limit since email clients can retry)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateCheck = await checkRateLimit(`tracking:${ip}`, 60)
    if (!rateCheck.allowed) {
      return new NextResponse(TRANSPARENT_PIXEL, { status: 200, headers: PIXEL_HEADERS })
    }

    console.log(`[Tracking Pixel] Open event received for token: ${params.token}`)
    console.log(`[Tracking Pixel] Referer: ${request.headers.get('referer') || 'none'}`)
    console.log(`[Tracking Pixel] User-Agent: ${request.headers.get('user-agent') || 'none'}`)
    
    // Find message by tracking token with request and related data
    const message = await prisma.message.findUnique({
      where: { trackingToken: params.token },
      include: {
        request: {
          include: {
            messages: {
              where: { direction: "INBOUND" },
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    })

    if (!message) {
      console.log(`[Tracking Pixel] No message found for token: ${params.token}`)
      return new NextResponse(TRANSPARENT_PIXEL, { status: 200, headers: PIXEL_HEADERS })
    }

    const task = message.request
    if (!task) {
      console.error(`[Tracking Pixel] Request not found for message ${message.id}`)
      // Still return pixel
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      )
      return new NextResponse(pixel, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }

    const isFirstOpen = !message.openedAt
    const now = new Date()

    console.log(`[Tracking Pixel] Message ${message.id} opened (Task: ${task.id}). First open: ${isFirstOpen}`)

    // Update message read receipt
    await prisma.message.update({
      where: { id: message.id },
      data: {
        openedAt: message.openedAt || now,
        openedCount: { increment: 1 },
        lastOpenedAt: now
      }
    })

    // Check if there are replies (inbound messages)
    const hasReplies = task.messages.length > 0
    const latestInboundMessage = task.messages[0] || null

    // Only update task if no manual override exists (manual overrides take precedence)
    if (!task.manualRiskOverride) {
      // Compute risk based on current state
      const riskComputation = computeDeterministicRisk({
        hasReplies,
        latestResponseText: latestInboundMessage?.body || latestInboundMessage?.htmlBody || null,
        latestInboundClassification: latestInboundMessage?.aiClassification || null,
        completionPercentage: task.completionPercentage,
        openedAt: now, // Email was just opened
        lastOpenedAt: now,
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified,
        lastActivityAt: now,
        deadlineDate: task.deadlineDate || null
      })

      // Update request with readStatus, riskLevel, riskReason, and lastActivityAt
      // Note: readStatus is determined from openedAt + hasReplies, not stored separately
      await prisma.request.update({
        where: { id: task.id },
        data: {
          readStatus: riskComputation.readStatus,
          riskLevel: riskComputation.riskLevel,
          riskReason: riskComputation.riskReason,
          lastActivityAt: now
        }
      })

      console.log(`[Tracking Pixel] Task ${task.id} updated: readStatus=${riskComputation.readStatus}, riskLevel=${riskComputation.riskLevel}, reason="${riskComputation.riskReason}"`)
      
      // Structured log for open event ingestion
      const recipientHash = createHash('sha256').update((message.toAddress || '').toLowerCase().trim()).digest('hex').substring(0, 16)
      console.log(JSON.stringify({
        event: 'open_ingested',
        requestId: task.id,
        recipientHash,
        timestampMs: now.getTime(),
        result: {
          riskLevel: riskComputation.riskLevel,
          readStatus: riskComputation.readStatus
        }
      }))
    } else {
      // Manual override exists - only update lastActivityAt, not risk
      await prisma.request.update({
        where: { id: task.id },
        data: {
          lastActivityAt: now
        }
      })
      console.log(`[Tracking Pixel] Task ${task.id} has manual override (${task.manualRiskOverride}), skipping risk recomputation. Updated lastActivityAt only.`)
      
      // Structured log for open event (with manual override)
      const recipientHash = createHash('sha256').update((message.toAddress || '').toLowerCase().trim()).digest('hex').substring(0, 16)
      console.log(JSON.stringify({
        event: 'open_ingested',
        requestId: task.id,
        recipientHash,
        timestampMs: now.getTime(),
        result: {
          riskLevel: task.manualRiskOverride || task.riskLevel,
          readStatus: task.readStatus
        },
        note: 'manual_override'
      }))
    }

    return new NextResponse(TRANSPARENT_PIXEL, { status: 200, headers: PIXEL_HEADERS })
  } catch (error: any) {
    console.error('[Tracking Pixel] Error processing open event:', error)
    
    return new NextResponse(TRANSPARENT_PIXEL, { status: 200, headers: PIXEL_HEADERS })
  }
}

