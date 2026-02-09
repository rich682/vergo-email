import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to check for any inbound messages (replies) in the system
 * GET /api/admin/check-replies
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get ALL inbound messages in the system (not just for this org, for debugging)
    const allInboundMessages = await prisma.message.findMany({
      where: {
        direction: "INBOUND"
      },
      select: {
        id: true,
        requestId: true,
        fromAddress: true,
        toAddress: true,
        subject: true,
        direction: true,
        createdAt: true,
        providerId: true,
        messageIdHeader: true,
        threadId: true,
        providerData: true,
        isAutoReply: true,
        attachments: true,
        request: {
          select: {
            id: true,
            organizationId: true,
            campaignName: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    })

    // Get inbound messages for THIS organization
    const orgInboundMessages = await prisma.message.findMany({
      where: {
        direction: "INBOUND",
        request: {
          organizationId: session.user.organizationId
        }
      },
      select: {
        id: true,
        requestId: true,
        fromAddress: true,
        toAddress: true,
        subject: true,
        createdAt: true,
        isAutoReply: true,
        attachments: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })

    // Get all outbound messages to compare
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
        toAddress: true,
        subject: true,
        messageIdHeader: true,
        threadId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })

    // Get connected accounts for this organization
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        syncCursor: true,
        organizationId: true
      }
    })

    // Also get ALL connected accounts in the system for debugging (ConnectedEmailAccount table)
    const allConnectedAccounts = await prisma.connectedEmailAccount.findMany({
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        organizationId: true
      }
    })

    // Get requests with replies
    const tasksWithReplies = await prisma.request.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: {
          in: ["REPLIED", "HAS_ATTACHMENTS"]
        }
      },
      select: {
        id: true,
        campaignName: true,
        status: true,
        hasAttachments: true,
        _count: {
          select: {
            messages: true
          }
        }
      },
      take: 20
    })

    // Get collected items (attachments from replies)
    const collectedItems = await prisma.collectedItem.findMany({
      where: {
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        filename: true,
        submittedBy: true,
        receivedAt: true,
        requestId: true,
        taskInstanceId: true
      },
      orderBy: {
        receivedAt: "desc"
      },
      take: 20
    })

    return NextResponse.json({
      summary: {
        totalInboundMessagesInSystem: allInboundMessages.length,
        inboundMessagesForYourOrg: orgInboundMessages.length,
        outboundMessagesForYourOrg: outboundMessages.length,
        tasksWithReplies: tasksWithReplies.length,
        collectedItems: collectedItems.length,
        connectedAccounts: accounts.length
      },
      allInboundMessages: allInboundMessages.map(m => ({
        id: m.id,
        requestId: m.requestId,
        from: m.fromAddress,
        to: m.toAddress,
        subject: m.subject?.substring(0, 60),
        createdAt: m.createdAt,
        isAutoReply: m.isAutoReply,
        hasAttachments: !!m.attachments,
        taskOrgId: m.request?.organizationId,
        providerData: m.providerData ? {
          provider: (m.providerData as any)?.provider,
          inReplyTo: (m.providerData as any)?.inReplyTo,
          threadId: (m.providerData as any)?.threadId,
          conversationId: (m.providerData as any)?.conversationId,
        } : null
      })),
      orgInboundMessages,
      outboundMessages: outboundMessages.map(m => ({
        ...m,
        messageIdHeader: m.messageIdHeader || 'MISSING!'
      })),
      tasksWithReplies,
      collectedItems,
      accounts: accounts.map(a => ({
        ...a,
        hasCursor: !!a.syncCursor
      })),
      allConnectedEmailAccounts: allConnectedAccounts,
      yourOrganizationId: session.user.organizationId,
      yourUserId: session.user.id
    })
  } catch (error: any) {
    console.error("[Check Replies] Error:", error)
    return NextResponse.json({ error: "Failed to check replies" }, { status: 500 })
  }
}
