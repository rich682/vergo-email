/**
 * GET /api/auth/verify?token=xxx
 * Verify email address with token
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Verification token is required" },
        { status: 400 }
      )
    }

    // Find user with this token
    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
      include: {
        organization: {
          select: { name: true }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired verification link" },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { success: false, error: "Verification link has expired. Please request a new one." },
        { status: 400 }
      )
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: "Email already verified. You can sign in.",
        alreadyVerified: true,
        organizationName: user.organization.name
      })
    }

    // Mark user as verified and clear token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        tokenExpiresAt: null
      }
    })

    console.log(`[Verify] Email verified for user ${user.id} (${user.email})`)

    return NextResponse.json({
      success: true,
      message: "Email verified successfully! You can now sign in.",
      organizationName: user.organization.name
    })

  } catch (error: any) {
    console.error("[Verify] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to verify email" },
      { status: 500 }
    )
  }
}
