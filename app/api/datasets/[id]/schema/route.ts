/**
 * Dataset Template Schema API Routes
 * 
 * PATCH /api/datasets/[id]/schema - Update schema and identity key
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { schema, identityKey, stakeholderMapping } = body

    if (!schema || !identityKey) {
      return NextResponse.json(
        { error: "Missing required fields: schema, identityKey" },
        { status: 400 }
      )
    }

    if (!Array.isArray(schema) || schema.length === 0) {
      return NextResponse.json(
        { error: "Schema must be a non-empty array of columns" },
        { status: 400 }
      )
    }

    const template = await DatasetService.updateSchema(
      params.id,
      session.user.organizationId,
      schema,
      identityKey,
      stakeholderMapping
    )

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error updating dataset schema:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update dataset schema" },
      { status: 500 }
    )
  }
}
