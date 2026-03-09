/**
 * Jobs Bulk Import Endpoint
 *
 * POST /api/task-instances/bulk-import - Interpret spreadsheet data using AI
 *
 * Takes raw spreadsheet rows and uses GPT to extract:
 * - Item name
 * - Target date pattern (accounting-friendly, e.g., "28th of each month")
 * - Owner (matched to team members)
 * - Task type (reconciliation, report, form, request, analysis, other)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { canPerformAction } from "@/lib/permissions"
import { parseTargetDateText } from "@/lib/target-date-rules"

export const maxDuration = 30

const VALID_TASK_TYPES = ["reconciliation", "report", "form", "request", "analysis", "other"]

interface ParsedItem {
  name: string
  dueDate?: string
  ownerId?: string
  ownerName?: string
  taskType?: string
  targetDateText?: string
}

interface TeamMember {
  id: string
  name: string | null
  email: string
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

    if (!canPerformAction(session.user.role, "tasks:import", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to bulk import tasks" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const body = await request.json()
    const { rows } = body as { rows: (string | number | null)[][] }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No data provided" },
        { status: 400 }
      )
    }

    // Fetch team members for owner matching
    const teamMembers = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true
      }
    })

    // Build team member list for AI prompt
    const teamMembersList = teamMembers.map(m => ({
      id: m.id,
      name: m.name || m.email.split('@')[0],
      email: m.email
    }))

    // Limit to first 100 rows to avoid token limits
    const limitedRows = rows.slice(0, 100)

    // Format rows for the prompt
    const formattedRows = limitedRows.map((row, i) => {
      const cells = row.map(cell => cell === null || cell === undefined ? "" : String(cell).trim())
      return `Row ${i + 1}: ${cells.join(" | ")}`
    }).join("\n")

    // Call OpenAI to interpret the data
    const openai = getOpenAIClient()

    const teamMembersPrompt = teamMembersList.length > 0
      ? `\n\nTeam members available for owner assignment:\n${teamMembersList.map(m => `- "${m.name}" (ID: ${m.id})`).join('\n')}`
      : ''

    const systemPrompt = `You are a data extraction assistant. Your job is to interpret spreadsheet data and extract tasks.

For each row, extract:
1. The task name (the main task description)
2. A target date pattern if one is present. Keep the original text as-is (e.g., "28th of each month", "every other Friday", "last day of each month", "every Friday", "4th of each month"). If it's a specific date, convert to ISO format YYYY-MM-DD and use that as "dueDate" instead.
3. An owner if one is mentioned (match to team member ID)
4. A task type if one can be inferred. Must be one of: "reconciliation", "report", "form", "request", "analysis", "other". Look for keywords like "reconcile" -> "reconciliation", "report" -> "report", "form" -> "form", etc.${teamMembersPrompt}

Rules:
- Skip header rows (rows that look like column titles)
- Skip empty or irrelevant rows
- The task name should be a clear, concise description
- For target dates that are recurring patterns (e.g., "28th of each month", "every Friday", "every other Friday", "last day of month", "EOM"), return them as "targetDateText" with the pattern text preserved
- For specific dates, return as "dueDate" in ISO format YYYY-MM-DD
- If a date is relative (e.g., "next Friday"), convert it to an absolute date based on today being ${new Date().toISOString().split('T')[0]}
- For owner matching: look for names in the spreadsheet that match team members. Use fuzzy matching (e.g., "Rich Kane" matches "Richard Kane", "Tracy B" matches "Tracy Baldwin"). Only include ownerId if you find a confident match.
- "Everyone" as an owner means leave ownerId empty

Return a JSON array of objects with "name", optionally "targetDateText" OR "dueDate", optionally "ownerId" and "ownerName", optionally "taskType".`

    const userPrompt = `Extract tasks from this spreadsheet data:

${formattedRows}

Return ONLY a valid JSON array, no other text. Example format:
[{"name": "Reconcile bank accounts", "targetDateText": "6th of each month", "ownerId": "abc123", "ownerName": "John Smith", "taskType": "reconciliation"}, {"name": "Submit expense reports", "dueDate": "2024-02-15", "taskType": "other"}]`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })

    const responseText = completion.choices[0]?.message?.content || "[]"

    // Parse the JSON response
    let items: ParsedItem[] = []
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText)
      return NextResponse.json(
        { error: "Failed to interpret spreadsheet data" },
        { status: 500 }
      )
    }

    // Validate and clean items
    const teamMemberIds = new Set(teamMembers.map(m => m.id))
    const validItems = items
      .filter(item => item.name && typeof item.name === "string" && item.name.trim().length > 0)
      .map(item => {
        // Parse target date text into a rule
        const targetDateRule = item.targetDateText
          ? parseTargetDateText(item.targetDateText)
          : null

        return {
          name: item.name.trim(),
          dueDate: item.dueDate && isValidDate(item.dueDate) ? item.dueDate : undefined,
          targetDateText: item.targetDateText || undefined,
          targetDateRule: targetDateRule || undefined,
          taskType: item.taskType && VALID_TASK_TYPES.includes(item.taskType) ? item.taskType : undefined,
          // Only include ownerId if it's a valid team member
          ownerId: item.ownerId && teamMemberIds.has(item.ownerId) ? item.ownerId : undefined,
          ownerName: item.ownerId && teamMemberIds.has(item.ownerId) ? item.ownerName : undefined
        }
      })

    return NextResponse.json({
      success: true,
      items: validItems,
      teamMembers: teamMembersList,
      totalRows: rows.length,
      processedRows: limitedRows.length
    })

  } catch (error: any) {
    console.error("Bulk import error:", error)
    return NextResponse.json(
      { error: "Failed to process import" },
      { status: 500 }
    )
  }
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}
