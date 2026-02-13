/**
 * Role Permissions API
 *
 * GET /api/org/role-permissions - Get org-level action permissions
 * PUT /api/org/role-permissions - Update org-level action permissions (admin only)
 *
 * Stored in Organization.features JSON as:
 * { roleActionPermissions: { MEMBER: { "reports:view_definitions": true, ... }, MANAGER: { ... } } }
 *
 * Module visibility is derived automatically from action permissions —
 * if a user has ANY action permission for a module, they can see/access it.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ALL_ACTION_KEYS, type ActionKey } from "@/lib/permissions"

const CONFIGURABLE_ROLES = ["MEMBER", "MANAGER"] as const

/**
 * GET - Fetch org-level role action permissions
 * Any authenticated user can read (needed for permission resolution)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { features: true }
    })

    const features = (organization?.features as Record<string, any>) || {}
    const roleActionPermissions = features.roleActionPermissions || null

    return NextResponse.json({
      success: true,
      roleActionPermissions,
    })
  } catch (error: any) {
    console.error("[RolePermissions] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch role permissions" },
      { status: 500 }
    )
  }
}

/**
 * PUT - Update org-level role action permissions
 * Admin-only endpoint
 *
 * Body: { roleActionPermissions: { MEMBER: { "reports:view_definitions": true, ... }, MANAGER: { ... } } }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can update role permissions" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { roleActionPermissions } = body

    if (!roleActionPermissions || typeof roleActionPermissions !== "object") {
      return NextResponse.json(
        { error: "roleActionPermissions object is required" },
        { status: 400 }
      )
    }

    // Validate and sanitize action permissions
    const validActionKeys = new Set<string>(ALL_ACTION_KEYS)
    const sanitizedActions: Record<string, Partial<Record<ActionKey, boolean>>> = {}

    for (const role of CONFIGURABLE_ROLES) {
      if (role in roleActionPermissions) {
        const rolePerms = roleActionPermissions[role]
        if (typeof rolePerms !== "object" || Array.isArray(rolePerms)) {
          return NextResponse.json(
            { error: `Invalid action permissions for role ${role}` },
            { status: 400 }
          )
        }

        const sanitizedRoleActions: Partial<Record<ActionKey, boolean>> = {}
        for (const [key, val] of Object.entries(rolePerms)) {
          // Filter out legacy module:* keys that may still be sent by older clients
          if (key.startsWith("module:")) continue
          if (validActionKeys.has(key) && typeof val === "boolean") {
            sanitizedRoleActions[key as ActionKey] = val
          }
        }
        sanitizedActions[role] = sanitizedRoleActions
      }
    }

    // Merge with existing features (preserve other feature flags)
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { features: true }
    })

    const existingFeatures = (organization?.features as Record<string, any>) || {}

    const updateData: Record<string, any> = {
      ...existingFeatures,
      roleActionPermissions: sanitizedActions,
    }

    const updatedOrg = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: {
        features: updateData,
      },
      select: { features: true }
    })

    const updatedFeatures = (updatedOrg.features as Record<string, any>) || {}

    console.log(`[RolePermissions] Role permissions updated by user ${session.user.id}`)

    return NextResponse.json({
      success: true,
      roleActionPermissions: updatedFeatures.roleActionPermissions || null,
    })
  } catch (error: any) {
    console.error("[RolePermissions] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update role permissions" },
      { status: 500 }
    )
  }
}
