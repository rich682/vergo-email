/**
 * POST /api/reconciliations/suggest-mappings
 * Uses AI to suggest column mappings between two analyzed file sources.
 * Receives both sets of columns with sample values, returns ranked mappings.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { getOpenAIClient } from "@/lib/utils/openai-client"

export const maxDuration = 30

interface ColumnInfo {
  key: string
  label: string
  sampleValues: string[]
  suggestedType: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reconciliations" }, { status: 403 })
    }

    const body = await request.json()
    const { sourceA, sourceB } = body as {
      sourceA: { label: string; columns: ColumnInfo[] }
      sourceB: { label: string; columns: ColumnInfo[] }
    }

    if (!sourceA?.columns?.length || !sourceB?.columns?.length) {
      return NextResponse.json({ error: "Both sources must have columns" }, { status: 400 })
    }

    const openai = getOpenAIClient()

    // Build a clear description of both sources for the AI
    const sourceADesc = sourceA.columns
      .map((c) => `  - "${c.label}" (type: ${c.suggestedType}, samples: ${c.sampleValues.slice(0, 2).join(", ")})`)
      .join("\n")
    const sourceBDesc = sourceB.columns
      .map((c) => `  - "${c.label}" (type: ${c.suggestedType}, samples: ${c.sampleValues.slice(0, 2).join(", ")})`)
      .join("\n")

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at reconciling financial data. Given two sets of columns from different data sources, suggest which columns from Source A map to which columns in Source B.

Consider:
- Column name similarity (e.g. "Tran Date" maps to "Transaction Date" or "Date")
- Data type compatibility (dates should map to dates, amounts to amounts)
- Sample value patterns (similar formats suggest a match)
- Semantic meaning (e.g. "Description" maps to "Merchant Name" or "Payee")
- A column in one source might not have a match in the other -- that's OK

Return JSON with this structure:
{
  "mappings": [
    {
      "sourceAKey": "exact key from source A",
      "sourceBKey": "exact key from source B",
      "confidence": "high" | "medium" | "low",
      "type": "date" | "amount" | "text" | "reference",
      "label": "a clean display label for this pair"
    }
  ]
}

Rules:
- Each Source A key can appear at most once
- Each Source B key can appear at most once
- Only include confident matches -- leave uncertain ones unmapped
- The "label" should be a clean name describing what the mapped column represents (e.g. "Transaction Date", "Amount", "Description")
- The "type" should reflect the data type of the mapping`,
        },
        {
          role: "user",
          content: `Source A: "${sourceA.label}"
${sourceADesc}

Source B: "${sourceB.label}"
${sourceBDesc}

Suggest column mappings between these two data sources.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ mappings: [] })
    }

    const parsed = JSON.parse(content)
    const mappings = (parsed.mappings || []).map((m: any) => ({
      sourceAKey: m.sourceAKey,
      sourceBKey: m.sourceBKey,
      confidence: m.confidence || "medium",
      type: m.type || "text",
      label: m.label || m.sourceAKey,
    }))

    // Validate that all keys actually exist in the sources
    const validAKeys = new Set(sourceA.columns.map((c) => c.key))
    const validBKeys = new Set(sourceB.columns.map((c) => c.key))
    const validMappings = mappings.filter(
      (m: any) => validAKeys.has(m.sourceAKey) && validBKeys.has(m.sourceBKey)
    )

    return NextResponse.json({ mappings: validMappings })
  } catch (error: any) {
    console.error("[Suggest Mappings] Error:", error)
    return NextResponse.json(
      { error: "Failed to suggest mappings" },
      { status: 500 }
    )
  }
}
