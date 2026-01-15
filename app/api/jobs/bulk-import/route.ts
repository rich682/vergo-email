/**
 * Jobs Bulk Import Endpoint
 * 
 * POST /api/jobs/bulk-import - Interpret spreadsheet data using AI
 * 
 * Takes raw spreadsheet rows and uses GPT to extract:
 * - Item name
 * - Due date (if present)
 * - Owner (matched to team members)
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

interface ParsedItem {
  name: string
  dueDate?: string
  ownerId?: string
  ownerName?: string
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
2. A due date if one is present (in ISO format YYYY-MM-DD)
3. An owner if one is mentioned (match to team member ID)${teamMembersPrompt}

Rules:
- Skip header rows (rows that look like column titles)
- Skip empty or irrelevant rows
- The task name should be a clear, concise description
- Only include a dueDate if there's a clear date in the row
- If a date is relative (e.g., "next Friday"), convert it to an absolute date based on today being ${new Date().toISOString().split('T')[0]}
- For owner matching: look for names in the spreadsheet that match team members. Use fuzzy matching (e.g., "Rich Kane" matches "Richard Kane", "Tracy B" matches "Tracy Baldwin"). Only include ownerId if you find a confident match.

Return a JSON array of objects with "name", optionally "dueDate", and optionally "ownerId" (the matched team member ID) and "ownerName" (the matched name for display).`

    const userPrompt = `Extract tasks from this spreadsheet data:

${formattedRows}

Return ONLY a valid JSON array, no other text. Example format:
[{"name": "Task description", "dueDate": "2024-02-15", "ownerId": "abc123", "ownerName": "John Smith"}, {"name": "Another task"}]`

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
      .map(item => ({
        name: item.name.trim(),
        dueDate: item.dueDate && isValidDate(item.dueDate) ? item.dueDate : undefined,
        // Only include ownerId if it's a valid team member
        ownerId: item.ownerId && teamMemberIds.has(item.ownerId) ? item.ownerId : undefined,
        ownerName: item.ownerId && teamMemberIds.has(item.ownerId) ? item.ownerName : undefined
      }))

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
      { error: "Failed to process import", message: error.message },
      { status: 500 }
    )
  }
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}
