import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EmailSendingService } from "@/lib/services/email-sending.service"

/**
 * Convert plain text to HTML with proper formatting
 */
function textToHtml(text: string): string {
  // Escape HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // Convert double newlines to paragraph breaks, single newlines to <br>
  html = html
    .split(/\n\n+/)
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
  
  return html
}

export async function POST(
  request: Request,
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
    const { body: replyBody } = body

    // Get user info for signature
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, signature: true }
    })

    // Get organization for signature fallback
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true }
    })

    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      },
      include: {
        entity: true
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    if (!task.entity?.email) {
      return NextResponse.json(
        { error: "Entity email not found" },
        { status: 400 }
      )
    }

    // Find the last message in the conversation to get threading info
    // Prefer the most recent message (either inbound or outbound) for In-Reply-To
    const lastMessage = await prisma.message.findFirst({
      where: { requestId: task.id },
      orderBy: { createdAt: "desc" }
    })

    // Build threading headers
    let inReplyTo: string | undefined
    let references: string | undefined
    let threadId: string | undefined

    if (lastMessage) {
      // Get the Message-ID of the last message to use as In-Reply-To
      const lastMessageId = lastMessage.messageIdHeader || 
        (lastMessage.providerData as any)?.messageIdHeader || 
        (lastMessage.providerData as any)?.internetMessageId
      
      if (lastMessageId) {
        inReplyTo = lastMessageId
      }

      // Build References header (chain of message IDs)
      // For simplicity, we'll just use the In-Reply-To value
      // A more complete implementation would collect all message IDs in the thread
      if (inReplyTo) {
        references = inReplyTo
      }

      // Get thread ID for Gmail threading
      threadId = lastMessage.threadId || 
        (lastMessage.providerData as any)?.threadId ||
        (lastMessage.providerData as any)?.conversationId ||
        task.threadId || undefined
    }

    // Get original subject for proper Re: threading
    const originalSubject = lastMessage?.subject || task.campaignName || "Your message"
    // Remove existing Re: prefixes to avoid "Re: Re: Re:"
    const cleanSubject = originalSubject.replace(/^(Re:\s*)+/i, "").trim()
    const replySubject = `Re: ${cleanSubject}`

    // Build signature - use user's custom signature if available, otherwise build from user/org data
    let signature: string
    if (user?.signature && user.signature.trim() !== '') {
      signature = user.signature
    } else {
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (organization?.name) signatureParts.push(organization.name)
      signature = signatureParts.join('\n')
    }

    // Append signature to reply body -- but skip if draft already includes it
    // (AI draft-reply endpoint pre-appends the signature for preview purposes)
    const signatureAlreadyPresent = signature && replyBody.includes(signature.trim())
    const bodyWithSignature = (signature && !signatureAlreadyPresent)
      ? `${replyBody}\n\nBest regards,\n\n${signature}`
      : replyBody

    // Convert to HTML with proper formatting
    const htmlBody = textToHtml(bodyWithSignature)

    // Send reply using existing task method with threading headers
    const sent = await EmailSendingService.sendEmailForExistingTask({
      taskId: task.id,
      entityId: task.entityId!,
      organizationId: session.user.organizationId,
      to: task.entity!.email,
      subject: replySubject,
      body: bodyWithSignature,
      htmlBody,
      inReplyTo,
      references,
      threadId
    })

    return NextResponse.json({ success: true, messageId: sent.messageId })
  } catch (error: any) {
    console.error("Error sending reply:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

