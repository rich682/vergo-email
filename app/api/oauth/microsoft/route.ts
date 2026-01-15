import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenant = process.env.MS_TENANT_ID || "common"
  const clientId = process.env.MS_CLIENT_ID
  const redirectUri = process.env.MS_REDIRECT_URI
  const scopes = encodeURIComponent("offline_access Mail.Send Mail.Read Mail.ReadBasic Contacts.Read")

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Missing Microsoft OAuth env vars" }, { status: 500 })
  }

  const state = encodeURIComponent(
    JSON.stringify({
      organizationId: session.user.organizationId,
      userId: session.user.id,
    })
  )

  const authUrl =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
    `?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_mode=query` +
    `&scope=${scopes}` +
    `&state=${state}`

  return NextResponse.redirect(authUrl)
}



