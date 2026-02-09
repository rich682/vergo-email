/**
 * Forms API Endpoint
 * 
 * GET /api/forms - List all form definitions
 * POST /api/forms - Create a new form definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormDefinitionService } from "@/lib/services/form-definition.service"
import type { CreateFormDefinitionInput } from "@/lib/types/form"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const forms = await FormDefinitionService.findAll(session.user.organizationId)

    return NextResponse.json({ forms })
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
