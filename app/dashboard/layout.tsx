import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import React from "react"
import { DashboardShell } from "@/components/dashboard-shell"

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

  // Fetch organization name and feature flags
  let orgName: string | undefined
  let orgFeatures: Record<string, boolean> = {}
  try {
    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true, features: true },
    })
    orgName = org?.name || undefined
    if (org?.features && typeof org.features === "object") {
      orgFeatures = org.features as Record<string, boolean>
    }
  } catch (err) {
    console.error("[DashboardLayout] Failed to fetch org features:", err)
  }

  return (
    <DashboardShell
      userEmail={session.user.email || ""}
      userName={session.user.name || undefined}
      userRole={userRole}
      orgName={orgName}
      orgFeatures={orgFeatures}
    >
      {children}
    </DashboardShell>
  )
}
