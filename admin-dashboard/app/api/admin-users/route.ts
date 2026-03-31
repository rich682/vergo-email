import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { requireAuth } from "@/lib/auth"
import { generateToken, tokenExpiry, sendAdminInviteEmail } from "@/lib/email"

const prisma = new PrismaClient()

export async function GET() {
  requireAuth()

  const users = await prisma.adminUser.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    users.map((u) => ({
      ...u,
      status: u.emailVerified ? "active" : "pending",
    }))
  )
}

export async function POST(request: NextRequest) {
  const currentAdmin = requireAuth()

  const { email, name } = await request.json()
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  const existing = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: "An admin with this email already exists" }, { status: 400 })
  }

  const token = generateToken()
  const tokenHash = await bcrypt.hash(token, 10)

  const user = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash: "",
      inviteToken: tokenHash,
      inviteTokenExpiry: tokenExpiry("invite"),
      invitedBy: currentAdmin.id,
      emailVerified: false,
    },
  })

  await sendAdminInviteEmail(user.email, token, currentAdmin.name || currentAdmin.email)

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    status: "pending",
  })
}
