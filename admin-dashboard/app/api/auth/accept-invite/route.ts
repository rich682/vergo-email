import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const users = await prisma.adminUser.findMany({
    where: {
      inviteToken: { not: null },
      inviteTokenExpiry: { gt: new Date() },
      emailVerified: false,
    },
  })

  let matched = null
  for (const user of users) {
    if (user.inviteToken && await bcrypt.compare(token, user.inviteToken)) {
      matched = user
      break
    }
  }

  if (!matched) {
    return NextResponse.json({ valid: false, error: "Invalid or expired invitation" })
  }

  return NextResponse.json({ valid: true, email: matched.email, name: matched.name })
}

export async function POST(request: NextRequest) {
  const { token, password } = await request.json()
  if (!token || !password) {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const users = await prisma.adminUser.findMany({
    where: {
      inviteToken: { not: null },
      inviteTokenExpiry: { gt: new Date() },
      emailVerified: false,
    },
  })

  let matched = null
  for (const user of users) {
    if (user.inviteToken && await bcrypt.compare(token, user.inviteToken)) {
      matched = user
      break
    }
  }

  if (!matched) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.adminUser.update({
    where: { id: matched.id },
    data: {
      passwordHash,
      emailVerified: true,
      inviteToken: null,
      inviteTokenExpiry: null,
    },
  })

  return NextResponse.json({ success: true })
}
