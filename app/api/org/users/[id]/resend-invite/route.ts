/**
 * Resend Invite API Endpoint
 *
 * POST /api/org/users/[id]/resend-invite - Resend invite email to a pending user
 *
 * Authorization: Admin only
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import { AuthEmailService } from "@/lib/services/auth-email.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userRole = session.user.role
    const inviterName = session.user.name || session.user.email

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await params

    // Find the target user
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        passwordHash: true,
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Only allow resending to pending users
    if (targetUser.emailVerified) {
      return NextResponse.json(
        { error: "User has already accepted their invite" },
        { status: 400 }
      )
    }

    // Get organization name for the invite email
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })

    // Generate a new invite token and expiry
    const inviteToken = AuthEmailService.generateToken()
    const tokenExpiresAt = AuthEmailService.getTokenExpiry("invite")

    // Update user with new token
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        verificationToken: inviteToken,
        tokenExpiresAt: tokenExpiresAt,
      }
    })

    // Send invitation email
    const emailResult = await AuthEmailService.sendTeamInviteEmail(
      targetUser.email,
      inviteToken,
      organization?.name || "your team",
      inviterName,
      targetUser.role
    )

    if (!emailResult.success) {
      console.error(`[ResendInvite] Failed to send invite email to ${targetUser.email}:`, emailResult.error)
      return NextResponse.json(
        { error: "Failed to send invitation email" },
        { status: 500 }
      )
    }

    console.log(`[ResendInvite] Invite email resent to ${targetUser.email}`)

    return NextResponse.json({
      success: true,
      message: "Invitation email resent successfully"
    })

  } catch (error: any) {
    console.error("Resend invite error:", error)
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    )
  }
}
