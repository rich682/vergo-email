import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { requireAuth } from "@/lib/auth"
import { generateToken, tokenExpiry, sendAdminInviteEmail } from "@/lib/email"

const prisma = new PrismaClient()

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const currentAdmin = requireAuth()

  const user = await prisma.adminUser.findUnique({ where: { id: params.id } })
  if (!user) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 })
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "This admin has already accepted their invite" }, { status: 400 })
  }

  const token = generateToken()
  const tokenHash = await bcrypt.hash(token, 10)

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      inviteToken: tokenHash,
      inviteTokenExpiry: tokenExpiry("invite"),
    },
  })

  await sendAdminInviteEmail(user.email, token, currentAdmin.name || currentAdmin.email)

  return NextResponse.json({ success: true })
}
