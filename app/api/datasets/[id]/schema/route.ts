/**
 * Dataset Template Schema API Routes
 * 
 * PATCH /api/datasets/[id]/schema - Update schema and identity configuration
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService, IdentityConfig } from "@/lib/services/dataset.service"

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
    const { schema, identity, identityKey, stakeholderMapping } = body

    // Resolve identity config (support both new object and legacy string)
    const resolvedIdentity: IdentityConfig | string | undefined = identity ?? identityKey

    if (!schema || !resolvedIdentity) {
      return NextResponse.json(
        { error: "Missing required fields: schema, identity (or identityKey)" },
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
      resolvedIdentity,  // Service accepts both IdentityConfig and string
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
