import { NextResponse } from "next/server"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailProvider } from "@prisma/client"
import { encrypt } from "@/lib/encryption"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_failed", request.url))
  }

  let organizationId: string | null = null
  let userId: string | null = null
  try {
    const parsed = JSON.parse(decodeURIComponent(state))
    organizationId = parsed.organizationId
    userId = parsed.userId
  } catch {
    organizationId = null
  }

  if (!organizationId || !userId) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_failed", request.url))
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.redirect(new URL("/auth/signin", request.url))
    }
    if (session.user.id !== userId || session.user.organizationId !== organizationId) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_failed", request.url))
    }

    const tokenUrl = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || "common"}/oauth2/v2.0/token`
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID || "",
      client_secret: process.env.MS_CLIENT_SECRET || "",
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MS_REDIRECT_URI || "",
      scope: "offline_access Mail.Send Contacts.Read",
    })

    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!tokenResp.ok) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_error", request.url))
    }

    const tokenData = await tokenResp.json()
    if (!tokenData.access_token || !tokenData.refresh_token) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_tokens", request.url))
    }

    // Get user email from Graph /me
    const meResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!meResp.ok) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_error", request.url))
    }
    const me = await meResp.json()
    const email = me.mail || me.userPrincipalName
    if (!email) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_email", request.url))
    }

    const expiresInMs = tokenData.expires_in ? Number(tokenData.expires_in) * 1000 : 3600 * 1000

    await EmailAccountService.createAccount({
      userId,
      organizationId,
      provider: EmailProvider.MICROSOFT,
      email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + expiresInMs),
      scopes: "offline_access Mail.Send Contacts.Read",
    })

    return NextResponse.redirect(new URL("/dashboard/settings?success=microsoft_connected", request.url))
  } catch (error) {
    console.error("Microsoft OAuth error:", error)
    return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_error", request.url))
  }
}

