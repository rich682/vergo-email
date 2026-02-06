import { NextRequest, NextResponse } from "next/server"
import { verifyPassword } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set("vergo_admin_auth", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })

  return response
}
