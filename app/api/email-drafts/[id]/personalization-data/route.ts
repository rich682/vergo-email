/**
 * Personalization Data API Endpoint
 * 
 * Handles storing CSV-based personalization data during draft generation.
 * Used to persist CSV rows as PersonalizationData records.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { PersonalizationDataService } from "@/lib/services/personalization-data.service"
import { EntityService } from "@/lib/services/entity.service"

export async function POST(
  request: NextRequest,
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
    const { csvRows, emailColumn, tagColumns } = body

    // Verify draft exists and belongs to user
    const draft = await EmailDraftService.findById(
      params.id,
      session.user.organizationId
    )

    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Delete existing personalization data for this draft
    await PersonalizationDataService.deleteByDraftId(params.id)

    // Build personalization data records
    const personalizationDataArray = []

    for (const row of csvRows) {
      const recipientEmail = row[emailColumn]?.toLowerCase().trim()
      if (!recipientEmail) continue

      // Build dataJson from all tag columns
      const dataJson: Record<string, string> = {}
      for (const tagColumn of tagColumns) {
        if (tagColumn !== emailColumn) {
          dataJson[tagColumn] = row[tagColumn]?.trim() || ""
        }
      }

      // Try to find existing entity by email and add First Name from contact database
      const entity = await EntityService.findByEmail(recipientEmail, session.user.organizationId)
      if (entity?.firstName) {
        // Always include First Name from contact database if available
        // This allows the AI to use {{First Name}} in greetings even if it's not in the user-defined variables
        dataJson["First Name"] = entity.firstName
      }

      personalizationDataArray.push({
        emailDraftId: params.id,
        recipientEmail: recipientEmail,
        contactId: entity?.id || null,
        dataJson
      })
    }

    // Bulk create personalization data
    if (personalizationDataArray.length > 0) {
      await PersonalizationDataService.createMany(personalizationDataArray)
    }

    return NextResponse.json({
      success: true,
      count: personalizationDataArray.length
    })
  } catch (error: any) {
    console.error("Error storing personalization data:", error)
    return NextResponse.json(
      { error: error.message || "Failed to store personalization data" },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
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
    // Verify draft exists and belongs to user
    const draft = await EmailDraftService.findById(
      params.id,
      session.user.organizationId
    )

    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Fetch personalization data
    const personalizationData = await PersonalizationDataService.findByDraftId(params.id)

    // Return a sample for preview (first 5 recipients)
    const sample = personalizationData.slice(0, 5).map(p => ({
      email: p.recipientEmail,
      data: p.dataJson as Record<string, string>
    }))

    return NextResponse.json({
      success: true,
      sample,
      total: personalizationData.length
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    })
  } catch (error: any) {
    console.error("Error fetching personalization data:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch personalization data" },
      { status: 500 }
    )
  }
}

