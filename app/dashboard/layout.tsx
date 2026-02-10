import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import React from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import type { OrgRoleDefaults } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let session
  try {
    session = await getServerSession(authOptions)
  } catch (error: any) {
    console.error('[DashboardLayout] getServerSession error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    redirect("/auth/signin")
  }

  if (!session) {
    redirect("/auth/signin")
  }

  const userRole = session.user?.role
  const moduleAccess = session.user?.moduleAccess || null

  // Fetch organization name, feature flags, and role defaults
  let orgName: string | undefined
  let orgFeatures: Record<string, boolean> = {}
  let orgRoleDefaults: OrgRoleDefaults = null
  try {
    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true, features: true },
    })
    orgName = org?.name || undefined
    if (org?.features && typeof org.features === "object") {
      const features = org.features as Record<string, any>
      orgFeatures = features as Record<string, boolean>
      // Extract role defaults from features
      if (features.roleDefaultModuleAccess) {
        orgRoleDefaults = features.roleDefaultModuleAccess as OrgRoleDefaults
      }
    }
  } catch (err) {
    console.error("[DashboardLayout] Failed to fetch org features:", err)
  }

  return (
    <DashboardShell
      userEmail={session.user.email || ""}
      userName={session.user.name || undefined}
      userRole={userRole}
      moduleAccess={moduleAccess}
      orgRoleDefaults={orgRoleDefaults}
      orgName={orgName}
      orgFeatures={orgFeatures}
    >
      {children}
    </DashboardShell>
  )
}
