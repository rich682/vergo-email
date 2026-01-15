/**
 * GET /api/auth/accept-invite?token=xxx - Validate invite token
 * POST /api/auth/accept-invite - Accept invite and set password
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

/**
 * GET - Validate that an invite token is valid
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
        role: true,
        tokenExpiresAt: true,
        passwordHash: true,
        organization: {
          select: {
            name: true
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired invitation link" },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { valid: false, error: "Invitation has expired. Please ask your admin to send a new invite." },
        { status: 400 }
      )
    }

    // Check if user already has a password (already accepted)
    if (user.passwordHash && user.passwordHash !== "") {
      return NextResponse.json(
        { valid: false, error: "This invitation has already been accepted. Please sign in." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationName: user.organization.name
    })

  } catch (error: any) {
    console.error("[AcceptInvite] Validation error:", error)
    return NextResponse.json(
      { valid: false, error: "Failed to validate invitation" },
      { status: 500 }
    )
  }
}

/**
 * POST - Accept invite and set password
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password, name } = body

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
      where: { verificationToken: token },
      include: {
        organization: {
          select: { name: true }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired invitation link" },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { error: "Invitation has expired. Please ask your admin to send a new invite." },
        { status: 400 }
      )
    }

    // Check if user already has a password
    if (user.passwordHash && user.passwordHash !== "") {
      return NextResponse.json(
        { error: "This invitation has already been accepted. Please sign in." },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update user: set password, clear token, mark as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        name: name?.trim() || user.name,
        verificationToken: null,
        tokenExpiresAt: null,
        emailVerified: true
      }
    })

    console.log(`[AcceptInvite] User ${user.id} accepted invite to ${user.organization.name}`)

    return NextResponse.json({
      success: true,
      message: "Account created successfully. You can now sign in.",
      organizationName: user.organization.name
    })

  } catch (error: any) {
    console.error("[AcceptInvite] Error:", error)
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    )
  }
}
