/**
 * Public Form Definition API
 *
 * GET /api/forms/public/[token]
 * Fetches form definition for universal link access (no auth required).
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { FormField } from "@/lib/types/form"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const formDef = await prisma.formDefinition.findFirst({
      where: {
        universalAccessToken: token,
        universalLinkEnabled: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        fields: true,
        settings: true,
        organization: {
          select: { name: true },
        },
      },
    })

    if (!formDef) {
      return NextResponse.json(
        { error: "Form not found or link is disabled" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      form: {
        id: formDef.id,
        name: formDef.name,
        description: formDef.description,
        fields: formDef.fields,
        settings: formDef.settings,
        organizationName: formDef.organization.name,
      },
    })
  } catch (error: any) {
    console.error("Error fetching public form:", error)
    return NextResponse.json(
      { error: "Failed to fetch form" },
      { status: 500 }
    )
  }
}
