/**
 * Forms API Endpoint
 * 
 * GET /api/forms - List all form definitions
 * POST /api/forms - Create a new form definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { FormDefinitionService } from "@/lib/services/form-definition.service"
import type { CreateFormDefinitionInput } from "@/lib/types/form"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "forms:view", session.user.orgActionPermissions)) {
      return NextResponse.json({ forms: [] })
    }

    const forms = await FormDefinitionService.findAll(session.user.organizationId)

    // Non-admin users only see forms they are viewers of
    const isAdmin = session.user.role === "ADMIN"
    const filteredForms = isAdmin
      ? forms
      : await (async () => {
          const viewerEntries = await prisma.formDefinitionViewer.findMany({
            where: { userId: session.user.id },
            select: { formDefinitionId: true },
          })
          const viewableIds = new Set(viewerEntries.map((v) => v.formDefinitionId))
          return forms.filter((f) => viewableIds.has(f.id))
        })()

    return NextResponse.json({ forms: filteredForms })
  } catch (error: any) {
    console.error("Error fetching forms:", error)
    return NextResponse.json(
      { error: "Failed to fetch forms" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "forms:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage forms" }, { status: 403 })
    }

    const body: CreateFormDefinitionInput = await request.json()

    // Validate required fields
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const form = await FormDefinitionService.create(
      session.user.organizationId,
      session.user.id,
      {
        ...body,
        name: body.name.trim(),
      }
    )

    return NextResponse.json({ form }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating form:", error)
    return NextResponse.json(
      { error: "Failed to create form" },
      { status: 500 }
    )
  }
}
