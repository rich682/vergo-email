/**
 * POST /api/auth/forgot-password
 * Generate a password reset token and send reset email
 */

import { NextRequest, NextResponse } from "next/server"
import { normalizeEmail } from "@/lib/utils/email"
import { prisma } from "@/lib/prisma"
import { AuthEmailService } from "@/lib/services/auth-email.service"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(email) || ""

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    // Always return success to prevent email enumeration attacks
    // But only send email if user exists
    if (user) {
      // Generate reset token
      const token = AuthEmailService.generateToken()
      const expiresAt = AuthEmailService.getTokenExpiry("reset")

      // Save token to user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: token,
          tokenExpiresAt: expiresAt
        }
      })

      // Send reset email
      const result = await AuthEmailService.sendPasswordResetEmail(
        normalizedEmail,
        token,
        user.name || undefined
      )

      if (!result.success) {
        console.error("[ForgotPassword] Failed to send email:", result.error)
        // Still return success to prevent enumeration
      } else {
        console.log(`[ForgotPassword] Reset email sent to ${normalizedEmail}`)
      }
    } else {
      console.log(`[ForgotPassword] No user found for email: ${normalizedEmail}`)
    }

    // Always return success message
    return NextResponse.json({
      success: true,
      message: "If an account exists with that email, you will receive a password reset link shortly."
    })

  } catch (error: any) {
    console.error("[ForgotPassword] Error:", error)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
