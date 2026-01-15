/**
 * GET /api/auth/reset-password?token=xxx - Validate reset token
 * POST /api/auth/reset-password - Reset password with token
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

/**
 * GET - Validate that a reset token is valid
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json(
        { valid: false, error: "Token is required" },
        { status: 400 }
      )
    }

    // Find user with this token
    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
      select: {
        id: true,
        email: true,
        name: true,
        tokenExpiresAt: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired reset link" },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { valid: false, error: "Reset link has expired. Please request a new one." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      email: user.email,
      name: user.name
    })

  } catch (error: any) {
    console.error("[ResetPassword] Validation error:", error)
    return NextResponse.json(
      { valid: false, error: "Failed to validate token" },
      { status: 500 }
    )
  }
}

/**
 * POST - Reset password with valid token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password } = body

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      )
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    // Find user with this token
    const user = await prisma.user.findUnique({
      where: { verificationToken: token }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { error: "Reset link has expired. Please request a new one." },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update user: set new password, clear token, mark as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
        emailVerified: true
      }
    })

    console.log(`[ResetPassword] Password reset successful for user ${user.id}`)

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully. You can now sign in."
    })

  } catch (error: any) {
    console.error("[ResetPassword] Error:", error)
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    )
  }
}
