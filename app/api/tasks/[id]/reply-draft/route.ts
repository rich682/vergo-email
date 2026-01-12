import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const taskId = params.id
  const body = await req.json().catch(() => ({}))
  const prompt = body.prompt || ""

  const task = await prisma.task.findUnique({
    where: { id: taskId, organizationId: session.user.organizationId },
    include: {
      entity: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  const latestInbound = task.messages.find((m) => m.direction === "INBOUND")
  const latestOutbound = task.messages.find((m) => m.direction === "OUTBOUND")

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    )
  }

  const requestContext = task.campaignName || latestOutbound?.subject || "Request"
  const requestBody = latestOutbound?.body || latestOutbound?.htmlBody || ""
  const replyPreview = latestInbound?.body || latestInbound?.htmlBody || ""

  const { default: OpenAI } = await import("openai")
  const openai = new OpenAI({ apiKey: openaiKey })

  const systemPrompt = `You are an assistant drafting a concise, professional accounting reply.
- Be clear and polite.
- Keep it short (3-6 sentences max).
- If the recipient is delayed or confused, ask for a firm date.
- Maintain context of the latest reply and the original request.`

  const userPrompt = `Original request: ${requestContext}
Original body (truncated): ${requestBody.substring(0, 400)}
Latest reply: ${replyPreview || "No reply yet"}
User prompt (optional): ${prompt || "(none)"}

Draft a reply for the accountant to send.`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 240,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    })

    const draft =
      completion.choices[0]?.message?.content?.trim() ||
      "Hello,\n\nFollowing up on the request. Please confirm when this will be completed.\n\nThank you."

    return NextResponse.json({ draft })
  } catch (error: any) {
    console.error("Draft generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    )
  }
}

