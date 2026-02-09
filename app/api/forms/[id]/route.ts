/**
 * Single Form API Endpoint
 * 
 * GET /api/forms/[id] - Get a form definition
 * PATCH /api/forms/[id] - Update a form definition
 * DELETE /api/forms/[id] - Delete a form definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormDefinitionService } from "@/lib/services/form-definition.service"
import type { UpdateFormDefinitionInput } from "@/lib/types/form"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const form = await FormDefinitionService.findById(id, session.user.organizationId)

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    return NextResponse.json({ form })
  } catch (error: any) {
    console.error("Error fetching form:", error)
    return NextResponse.json(
      { error: "Failed to fetch form" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body: UpdateFormDefinitionInput = await request.json()

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        )
      }
      body.name = body.name.trim()
    }

    const form = await FormDefinitionService.update(
      id,
      session.user.organizationId,
      body
    )

    return NextResponse.json({ form })
  } catch (error: any) {
    console.error("Error updating form:", error)
    
    if (error.message === "Form not found or access denied") {
      return NextResponse.json({ error: "Form not found or access denied" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to update form" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const result = await FormDefinitionService.delete(id, session.user.organizationId)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error deleting form:", error)
    
    if (error.message === "Form not found or access denied") {
      return NextResponse.json({ error: "Form not found or access denied" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to delete form" },
      { status: 500 }
    )
  }
}
