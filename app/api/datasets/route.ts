/**
 * Dataset API Routes
 * 
 * POST /api/datasets - Create a new dataset template
 * GET /api/datasets - List all dataset templates
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService, DatasetTemplateInput } from "@/lib/services/dataset.service"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, schema, identityKey, stakeholderMapping } = body

    if (!name || !schema || !identityKey) {
      return NextResponse.json(
        { error: "Missing required fields: name, schema, identityKey" },
        { status: 400 }
      )
    }

    if (!Array.isArray(schema) || schema.length === 0) {
      return NextResponse.json(
        { error: "Schema must be a non-empty array of columns" },
        { status: 400 }
      )
    }

    const input: DatasetTemplateInput = {
      name,
      description,
      schema,
      identityKey,
      stakeholderMapping,
    }

    const template = await DatasetService.createTemplate(
      session.user.organizationId,
      session.user.id,
      input
    )

    return NextResponse.json({ template }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating dataset template:", error)
    
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A dataset with this name already exists" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Failed to create dataset template" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const templates = await DatasetService.listTemplates(session.user.organizationId)

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error("Error listing dataset templates:", error)
    return NextResponse.json(
      { error: error.message || "Failed to list dataset templates" },
      { status: 500 }
    )
  }
}
