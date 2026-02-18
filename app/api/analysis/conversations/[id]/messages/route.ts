/**
 * Analysis Chat Messages API
 *
 * POST — Send a message, get streamed LLM response with SQL execution
 *
 * Returns Server-Sent Events (SSE) for real-time progress:
 *   event: status      → { data: "Generating SQL..." }
 *   event: sql         → { data: "SELECT ..." }
 *   event: result      → { data: { rows, totalRows, durationMs } }
 *   event: chart       → { data: { type, xKey, yKeys, title } }
 *   event: explanation  → { data: "Your analysis..." }
 *   event: done        → { data: { messageId } }
 *   event: error       → { data: "Error message" }
 */

import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { handleAnalysisChat } from "@/lib/analysis/text-to-sql"

export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!canPerformAction(session.user.role, "analysis:query", session.user.orgActionPermissions)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = await request.json()
  const { message } = body as { message: string }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (message.length > 5000) {
    return new Response(JSON.stringify({ error: "Message too long (max 5000 characters)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      try {
        await handleAnalysisChat(
          {
            conversationId: params.id,
            userMessage: message.trim(),
            organizationId: session.user.organizationId!,
            userId: session.user.id!,
          },
          sendEvent
        )
      } catch (error: any) {
        console.error("[Analysis Chat] Error:", error)

        if (error.message === "Conversation not found") {
          sendEvent("error", "Conversation not found")
        } else {
          sendEvent("error", "Failed to process your question. Please try again.")
        }
        sendEvent("done", { messageId: null })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
