import { NextResponse } from "next/server"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailProvider } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // Check if Microsoft returned an error
  if (error) {
    console.error("Microsoft OAuth error from provider:", error, errorDescription)
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=ms_${error}&message=${encodeURIComponent(errorDescription || "")}`, request.url)
    )
  }

  if (!code || !state) {
    console.error("Microsoft OAuth: Missing code or state")
    return NextResponse.redirect(new URL("/dashboard/settings?error=missing_code_or_state", request.url))
  }

  let organizationId: string | null = null
  let userId: string | null = null
  try {
    const parsed = JSON.parse(decodeURIComponent(state))
    organizationId = parsed.organizationId
    userId = parsed.userId
  } catch (e) {
    console.error("Microsoft OAuth: Failed to parse state:", e)
    return NextResponse.redirect(new URL("/dashboard/settings?error=invalid_state", request.url))
  }

  if (!organizationId || !userId) {
    console.error("Microsoft OAuth: Missing organizationId or userId in state")
    return NextResponse.redirect(new URL("/dashboard/settings?error=invalid_state_data", request.url))
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.organizationId) {
      console.error("Microsoft OAuth: No session found")
      return NextResponse.redirect(new URL("/auth/signin", request.url))
    }
    if (session.user.id !== userId || session.user.organizationId !== organizationId) {
      console.error("Microsoft OAuth: Session mismatch - expected:", { userId, organizationId }, "got:", { 
        userId: session.user.id, 
        organizationId: session.user.organizationId 
      })
      return NextResponse.redirect(new URL("/dashboard/settings?error=session_mismatch", request.url))
    }

    // Check required env vars
    if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET || !process.env.MS_REDIRECT_URI) {
      console.error("Microsoft OAuth: Missing env vars - MS_CLIENT_ID:", !!process.env.MS_CLIENT_ID, 
        "MS_CLIENT_SECRET:", !!process.env.MS_CLIENT_SECRET, 
        "MS_REDIRECT_URI:", !!process.env.MS_REDIRECT_URI)
      return NextResponse.redirect(new URL("/dashboard/settings?error=missing_config", request.url))
    }

    const tokenUrl = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || "common"}/oauth2/v2.0/token`
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MS_REDIRECT_URI,
      scope: "offline_access Mail.Send Mail.Read Mail.ReadBasic Contacts.Read",
    })

    console.log("Microsoft OAuth: Exchanging code for tokens...")
    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    const tokenData = await tokenResp.json()
    
    if (!tokenResp.ok) {
      console.error("Microsoft OAuth: Token exchange failed:", tokenData)
      return NextResponse.redirect(
        new URL(`/dashboard/settings?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error_description || tokenData.error || "Unknown error")}`, request.url)
      )
    }

    if (!tokenData.access_token) {
      console.error("Microsoft OAuth: No access token in response:", tokenData)
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_access_token", request.url))
    }
    
    if (!tokenData.refresh_token) {
      console.error("Microsoft OAuth: No refresh token in response (did you request offline_access scope?)")
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_refresh_token", request.url))
    }

    // Get user email from Graph /me
    console.log("Microsoft OAuth: Fetching user profile...")
    const meResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    
    if (!meResp.ok) {
      const meError = await meResp.text()
      console.error("Microsoft OAuth: Failed to fetch user profile:", meError)
      return NextResponse.redirect(new URL("/dashboard/settings?error=profile_fetch_failed", request.url))
    }
    
    const me = await meResp.json()
    const email = me.mail || me.userPrincipalName
    if (!email) {
      console.error("Microsoft OAuth: No email in user profile:", me)
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_email_in_profile", request.url))
    }

    console.log("Microsoft OAuth: Creating email account for:", email)
    const expiresInMs = tokenData.expires_in ? Number(tokenData.expires_in) * 1000 : 3600 * 1000

    await EmailAccountService.createAccount({
      userId,
      organizationId,
      provider: EmailProvider.MICROSOFT,
      email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + expiresInMs),
      scopes: "offline_access Mail.Send Mail.Read Mail.ReadBasic Contacts.Read",
    })

    console.log("Microsoft OAuth: Successfully connected account:", email)
    return NextResponse.redirect(new URL("/dashboard/settings?success=microsoft_connected", request.url))
  } catch (error: any) {
    console.error("Microsoft OAuth unexpected error:", error)
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=unexpected_error&message=${encodeURIComponent(error.message || "Unknown error")}`, request.url)
    )
  }
}

