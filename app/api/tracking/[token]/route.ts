import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    console.log(`[Tracking Pixel] Request received for token: ${params.token}`)
    console.log(`[Tracking Pixel] Referer: ${request.headers.get('referer') || 'none'}`)
    console.log(`[Tracking Pixel] User-Agent: ${request.headers.get('user-agent') || 'none'}`)
    
    // Find message by tracking token
    const message = await prisma.message.findUnique({
      where: { trackingToken: params.token },
      include: {
        task: true
      }
    })

    if (message) {
      console.log(`[Tracking Pixel] Message found: ${message.id}, Task: ${message.taskId}`)
      const isFirstOpen = !message.openedAt
      const now = new Date()

      // Update read receipt
      await prisma.message.update({
        where: { id: message.id },
        data: {
          openedAt: message.openedAt || now,
          openedCount: { increment: 1 },
          lastOpenedAt: now
        }
      })

      console.log(`[Tracking Pixel] Read receipt updated. First open: ${isFirstOpen}, Count: ${message.openedCount + 1}`)

      // Note: We don't update task status to REPLIED here because:
      // - "Replied" tab should only show tasks with actual inbound messages
      // - "Read" tab shows tasks that are opened but not replied to
      // - Task status should only change to REPLIED when there's an actual reply
    } else {
      console.log(`[Tracking Pixel] No message found for token: ${params.token}`)
    }

    // Return 1x1 transparent PNG image
    // Base64 encoded 1x1 transparent PNG
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )

    return new NextResponse(pixel, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Error processing tracking pixel:', error)
    
    // Still return the pixel even on error to avoid breaking email rendering
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )

    return new NextResponse(pixel, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }
}

