import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  const { token, newPassword } = await request.json()
  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password required" }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  // Find all users with a non-expired reset token
  const users = await prisma.adminUser.findMany({
    where: {
      resetToken: { not: null },
      resetTokenExpiry: { gt: new Date() },
    },
  })

  // Check the token hash against each candidate
  let matchedUser = null
  for (const user of users) {
    if (user.resetToken && await bcrypt.compare(token, user.resetToken)) {
      matchedUser = user
      break
    }
  }

  if (!matchedUser) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.adminUser.update({
    where: { id: matchedUser.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  })

  return NextResponse.json({ success: true })
}
