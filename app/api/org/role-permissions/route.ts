/**
 * Role Permissions API
 *
 * GET /api/org/role-permissions - Get org-level role default module access
 * PUT /api/org/role-permissions - Update org-level role defaults (admin only)
 *
 * Stored in Organization.features JSON as:
 * { roleDefaultModuleAccess: { MEMBER: { boards: true, ... }, MANAGER: { ... } } }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { ModuleAccess, ModuleKey } from "@/lib/permissions"

const VALID_MODULE_KEYS: ModuleKey[] = [
  "boards", "inbox", "requests", "collection", "reports",
  "forms", "databases", "reconciliations", "contacts"
]

const CONFIGURABLE_ROLES = ["MEMBER", "MANAGER"] as const

/**
 * GET - Fetch org-level role default module access
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
    const roleDefaults = features.roleDefaultModuleAccess || null

    return NextResponse.json({
      success: true,
      roleDefaultModuleAccess: roleDefaults
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
 * PUT - Update org-level role default module access
 * Admin-only endpoint
 *
 * Body: { roleDefaultModuleAccess: { MEMBER: { boards: true, ... }, MANAGER: { ... } } }
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
    const { roleDefaultModuleAccess } = body

    if (!roleDefaultModuleAccess || typeof roleDefaultModuleAccess !== "object") {
      return NextResponse.json(
        { error: "roleDefaultModuleAccess object is required" },
        { status: 400 }
      )
    }

    // Validate and sanitize each role's module access
    const sanitized: Record<string, ModuleAccess> = {}

    for (const role of CONFIGURABLE_ROLES) {
      if (role in roleDefaultModuleAccess) {
        const roleAccess = roleDefaultModuleAccess[role]
        if (typeof roleAccess !== "object" || Array.isArray(roleAccess)) {
          return NextResponse.json(
            { error: `Invalid module access for role ${role}` },
            { status: 400 }
          )
        }

        const sanitizedRole: ModuleAccess = {}
        for (const key of VALID_MODULE_KEYS) {
          if (key in roleAccess && typeof roleAccess[key] === "boolean") {
            sanitizedRole[key] = roleAccess[key]
          }
        }
        sanitized[role] = sanitizedRole
      }
    }

    // Merge with existing features (preserve other feature flags)
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { features: true }
    })

    const existingFeatures = (organization?.features as Record<string, any>) || {}

    const updatedOrg = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: {
        features: {
          ...existingFeatures,
          roleDefaultModuleAccess: sanitized
        }
      },
      select: { features: true }
    })

    const updatedFeatures = (updatedOrg.features as Record<string, any>) || {}

    console.log(`[RolePermissions] Role defaults updated by user ${session.user.id}`)

    return NextResponse.json({
      success: true,
      roleDefaultModuleAccess: updatedFeatures.roleDefaultModuleAccess || null
    })
  } catch (error: any) {
    console.error("[RolePermissions] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update role permissions" },
      { status: 500 }
    )
  }
}
