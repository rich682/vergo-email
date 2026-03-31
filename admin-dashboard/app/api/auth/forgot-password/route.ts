import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { generateToken, tokenExpiry, sendPasswordResetEmail } from "@/lib/email"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  // Always return success to avoid leaking which emails exist
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } })
  if (user && user.emailVerified) {
    const token = generateToken()
    const tokenHash = await bcrypt.hash(token, 10)

    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        resetToken: tokenHash,
        resetTokenExpiry: tokenExpiry("reset"),
      },
    })

    await sendPasswordResetEmail(user.email, token, user.name || undefined)
  }

  return NextResponse.json({ success: true })
}
