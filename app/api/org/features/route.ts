/**
 * Organization Features API
 * 
 * GET /api/org/features - Get feature flags for the current organization
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

// Default features for organizations without explicit settings
const DEFAULT_FEATURES = {
  expenses: false,
  ap: false
}

export type OrgFeatures = typeof DEFAULT_FEATURES

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { features: true }
    })

    // Merge stored features with defaults
    const storedFeatures = (org?.features as Partial<OrgFeatures>) || {}
    const features: OrgFeatures = {
      ...DEFAULT_FEATURES,
      ...storedFeatures
    }

    return NextResponse.json({ features })

  } catch (error: any) {
    console.error("Get org features error:", error)
    return NextResponse.json(
      { error: "Failed to get features" },
      { status: 500 }
    )
  }
}
