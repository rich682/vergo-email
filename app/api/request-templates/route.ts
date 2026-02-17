/**
 * Request Templates API - List and Create
 *
 * GET  /api/request-templates - List all request templates for the organization
 * POST /api/request-templates - Create a new request template
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ templates: [] })
    }

    const templates = await prisma.requestTemplate.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Error listing request templates:", error)
    return NextResponse.json({ error: "Failed to list request templates" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const body = await request.json()
    const { name, subjectTemplate, bodyTemplate, htmlBodyTemplate, availableTags } = body

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 })
    }
    if (!subjectTemplate || typeof subjectTemplate !== "string") {
      return NextResponse.json({ error: "Subject template is required" }, { status: 400 })
    }
    if (!bodyTemplate || typeof bodyTemplate !== "string") {
      return NextResponse.json({ error: "Body template is required" }, { status: 400 })
    }

    const template = await prisma.requestTemplate.create({
      data: {
        name: name.trim(),
        subjectTemplate,
        bodyTemplate,
        htmlBodyTemplate: htmlBodyTemplate || null,
        availableTags: availableTags || null,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error("Error creating request template:", error)
    return NextResponse.json({ error: "Failed to create request template" }, { status: 500 })
  }
}
