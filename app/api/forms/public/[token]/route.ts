/**
 * Public Form Definition API
 *
 * GET /api/forms/public/[token]
 * Fetches form definition for universal link access (no auth required).
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { FormField } from "@/lib/types/form"

function safeParseJson(value: unknown, fallback: unknown = null) {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

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
        organizationId: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    })

    if (!formDef) {
      return NextResponse.json(
        { error: "Form not found or link is disabled" },
        { status: 404 }
      )
    }

    // If form has any "users" type fields, include org users for the dropdown
    const fields = safeParseJson(formDef.fields, []) as FormField[]
    const hasUsersField = fields.some((f: FormField) => f.type === "users")
    let orgUsers: { id: string; name: string | null; email: string; tags: unknown }[] = []
    if (hasUsersField) {
      orgUsers = await prisma.user.findMany({
        where: { organizationId: formDef.organization.id, isDebugUser: false },
        select: { id: true, name: true, email: true, tags: true },
        orderBy: { name: "asc" },
      })
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
      orgUsers,
    })
  } catch (error: any) {
    console.error("Error fetching public form:", error)
    return NextResponse.json(
      { error: "Failed to fetch form" },
      { status: 500 }
    )
  }
}
