import { NextRequest, NextResponse } from "next/server"
import { verifyPassword, signToken, ADMIN_COOKIE } from "@/lib/auth"
import { seedFirstAdmin } from "@/lib/seed-admin"

export async function POST(request: NextRequest) {
  // Auto-seed first admin on first login attempt
  await seedFirstAdmin()

  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })
  }

  const admin = await verifyPassword(email, password)
  if (!admin) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = signToken(admin)
  const response = NextResponse.json({ success: true })
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  })

  return response
}
