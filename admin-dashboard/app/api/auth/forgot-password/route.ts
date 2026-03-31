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
  console.log(`[forgot-password] Lookup for ${email.toLowerCase()}: ${user ? `found (verified=${user.emailVerified})` : "not found"}`)

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

    const result = await sendPasswordResetEmail(user.email, token, user.name || undefined)
    console.log(`[forgot-password] Email send result:`, JSON.stringify(result))
  }

  return NextResponse.json({ success: true })
}
