/**
 * Jobs AI Generate Endpoint
 * 
 * POST /api/jobs/ai-generate - Generate a checklist from a natural language prompt
 * 
 * Takes a prompt like "create me a month end checklist" and uses AI to generate
 * a list of tasks with suggested due dates.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

interface GeneratedItem {
  name: string
  dueDate?: string
  description?: string
  priority?: "high" | "medium" | "low"
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { prompt, baseDate } = body as { prompt: string; baseDate?: string }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return NextResponse.json(
        { error: "Please provide a more detailed prompt" },
        { status: 400 }
      )
    }

    // Get today's date or use provided base date
    const today = baseDate || new Date().toISOString().split('T')[0]
    
    // Calculate some common date references
    const date = new Date(today)
    const year = date.getFullYear()
    const month = date.getMonth()
    
    // End of current month
    const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0]
    // End of quarter
    const quarterEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0).toISOString().split('T')[0]
    // End of year
    const endOfYear = `${year}-12-31`

    // Call OpenAI to generate the checklist
    const openai = getOpenAIClient()

    const systemPrompt = `You are a professional task planning assistant specializing in business operations, accounting, and compliance checklists. Generate comprehensive, actionable task lists based on user requests.

Key principles:
1. Tasks should be specific and actionable (not vague)
2. Include reasonable due dates relative to the base date
3. Order tasks logically (dependencies first, then parallel tasks, then final reviews)
4. Consider common compliance and regulatory requirements
5. Include preparation/gathering tasks before main execution tasks
6. Add review/approval checkpoints where appropriate

Date context:
- Today's date: ${today}
- End of current month: ${endOfMonth}
- End of current quarter: ${quarterEnd}
- End of current year: ${endOfYear}

For due dates, use ISO format (YYYY-MM-DD). Spread tasks appropriately - don't put everything on the last day.`

    const userPrompt = `Generate a detailed task checklist for: "${prompt}"

Return a JSON array of tasks. Each task should have:
- "name": A clear, actionable task title
- "dueDate": An appropriate due date in YYYY-MM-DD format (optional for flexible tasks)
- "description": A brief description of what the task involves (optional)
- "priority": "high", "medium", or "low" (optional)

Return ONLY a valid JSON array, no other text. Generate between 5-20 tasks depending on complexity.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })

    const responseText = completion.choices[0]?.message?.content || "[]"
    
    // Parse the JSON response
    let items: GeneratedItem[] = []
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText)
      return NextResponse.json(
        { error: "Failed to generate checklist. Please try again." },
        { status: 500 }
      )
    }

    // Validate and clean items
    const validItems = items
      .filter(item => item.name && typeof item.name === "string" && item.name.trim().length > 0)
      .map(item => ({
        name: item.name.trim(),
        dueDate: item.dueDate && isValidDate(item.dueDate) ? item.dueDate : undefined,
        description: item.description?.trim() || undefined,
        priority: ["high", "medium", "low"].includes(item.priority || "") ? item.priority : undefined
      }))

    if (validItems.length === 0) {
      return NextResponse.json(
        { error: "Could not generate tasks from your prompt. Please try a more specific request." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      items: validItems,
      prompt: prompt.trim()
    })

  } catch (error: any) {
    console.error("AI generate error:", error)
    return NextResponse.json(
      { error: "Failed to generate checklist", message: error.message },
      { status: 500 }
    )
  }
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}
