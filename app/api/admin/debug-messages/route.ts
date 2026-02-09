import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to inspect messages and their reply matching data
 * GET /api/admin/debug-messages - List recent outbound messages with their messageIdHeader
 * POST /api/admin/debug-messages - Test reply matching for a specific inReplyTo value
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get recent outbound messages with their messageIdHeader and threadId
    const outboundMessages = await prisma.message.findMany({
      where: {
        direction: "OUTBOUND",
        request: {
          organizationId: session.user.organizationId
        }
      },
      select: {
        id: true,
        requestId: true,
        subject: true,
        toAddress: true,
        fromAddress: true,
        messageIdHeader: true,
        threadId: true,
        providerId: true,
        providerData: true,
        createdAt: true,
        request: {
          select: {
            id: true,
            campaignName: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })

    // Get recent inbound messages to see what we're receiving
    const inboundMessages = await prisma.message.findMany({
      where: {
        direction: "INBOUND",
        request: {
          organizationId: session.user.organizationId
        }
      },
      select: {
        id: true,
        requestId: true,
        subject: true,
        fromAddress: true,
        toAddress: true,
        providerId: true,
        providerData: true,
        createdAt: true,
        request: {
          select: {
            id: true,
            campaignName: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })

    // Get connected accounts
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        syncCursor: true
      }
    })

    return NextResponse.json({
      outboundMessages: outboundMessages.map(m => ({
        ...m,
        providerData: m.providerData ? {
          // Only show relevant fields from providerData
          messageIdHeader: (m.providerData as any)?.messageIdHeader,
          internetMessageId: (m.providerData as any)?.internetMessageId,
          threadId: (m.providerData as any)?.threadId,
          conversationId: (m.providerData as any)?.conversationId,
          provider: (m.providerData as any)?.provider,
        } : null
      })),
      inboundMessages: inboundMessages.map(m => ({
        ...m,
        providerData: m.providerData ? {
          // Only show relevant fields from providerData
          inReplyTo: (m.providerData as any)?.inReplyTo,
          references: (m.providerData as any)?.references,
          threadId: (m.providerData as any)?.threadId,
          conversationId: (m.providerData as any)?.conversationId,
          provider: (m.providerData as any)?.provider,
          messageIdHeader: (m.providerData as any)?.messageIdHeader,
        } : null
      })),
      accounts,
      summary: {
        outboundCount: outboundMessages.length,
        inboundCount: inboundMessages.length,
        outboundWithMessageIdHeader: outboundMessages.filter(m => m.messageIdHeader).length,
        outboundWithThreadId: outboundMessages.filter(m => m.threadId).length,
      }
    })
  } catch (error: any) {
    console.error("[Debug Messages] Error:", error)
    return NextResponse.json({ error: "Failed to fetch debug messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { inReplyTo, threadId } = body

    const results: any = {
      searchedFor: { inReplyTo, threadId },
      matches: []
    }

    // Try to find by inReplyTo (Message-ID header)
    if (inReplyTo) {
      const normalizedInReplyTo = inReplyTo.replace(/^<|>$/g, "").trim()
      
      const byMessageIdHeader = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          OR: [
            { messageIdHeader: normalizedInReplyTo },
            { messageIdHeader: `<${normalizedInReplyTo}>` },
            { messageIdHeader: inReplyTo }
          ]
        },
        include: {
          request: true
        }
      })

      if (byMessageIdHeader) {
        results.matches.push({
          method: "messageIdHeader",
          message: byMessageIdHeader
        })
      }
    }

    // Try to find by threadId
    if (threadId) {
      const byThreadId = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          threadId: String(threadId)
        },
        include: {
          request: true
        }
      })

      if (byThreadId) {
        results.matches.push({
          method: "threadId",
          message: byThreadId
        })
      }
    }

    return NextResponse.json(results)
  } catch (error: any) {
    console.error("[Debug Messages] Error:", error)
    return NextResponse.json({ error: "Failed to search messages" }, { status: 500 })
  }
}
