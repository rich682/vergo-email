/**
 * Admin API endpoint to delete all previous requests/tasks for a clean start
 * This will delete all Tasks and EmailDrafts (Messages and PersonalizationData will cascade delete)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (session.user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    console.log(`[Cleanup] Starting cleanup of all requests for organization ${session.user.organizationId}...`)
    
    // Delete all requests for this organization
    // Messages will be automatically deleted due to CASCADE constraint
    const deletedTasks = await prisma.request.deleteMany({
      where: {
        organizationId: session.user.organizationId
      }
    })

    console.log(`[Cleanup] Deleted ${deletedTasks.count} tasks (and their associated messages)`)

    // Delete all email drafts for this organization
    // PersonalizationData will be automatically deleted due to CASCADE constraint
    const deletedDrafts = await prisma.emailDraft.deleteMany({
      where: {
        organizationId: session.user.organizationId
      }
    })

    console.log(`[Cleanup] Deleted ${deletedDrafts.count} email drafts (and their associated personalization data)`)

    return NextResponse.json({
      success: true,
      message: "Cleanup completed successfully",
      deleted: {
        tasks: deletedTasks.count,
        emailDrafts: deletedDrafts.count
      }
    })
  } catch (error: any) {
    console.error("[Cleanup] Error cleaning up requests:", error)
    return NextResponse.json(
      { 
        error: "Cleanup failed",
        message: error.message 
      },
      { status: 500 }
    )
  }
}


