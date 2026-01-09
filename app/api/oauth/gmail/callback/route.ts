import { NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailProvider } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // JSON with organizationId/userId

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=oauth_failed", request.url)
    )
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=no_tokens", request.url)
      )
    }

    // Set credentials explicitly
    oauth2Client.setCredentials(tokens)
    
    // Get user info to get email - use a fresh OAuth2 client to ensure credentials are applied
    const userInfoClient = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )
    userInfoClient.setCredentials(tokens)
    
    const oauth2 = google.oauth2({ version: "v2", auth: userInfoClient })
    const userInfo = await oauth2.userinfo.get()

    if (!userInfo.data.email) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=no_email", request.url)
      )
    }

    let organizationId = state
    let userId: string | null = null
    try {
      const parsed = JSON.parse(state)
      organizationId = parsed.organizationId || organizationId
      userId = parsed.userId || null
    } catch (e) {
      // Fallback to legacy state (org id only)
      organizationId = state
    }

    // Validate session matches state
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.redirect(new URL("/auth/signin", request.url))
    }
    if (userId && session.user.id !== userId) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_failed", request.url))
    }
    if (organizationId && session.user.organizationId !== organizationId) {
      return NextResponse.redirect(new URL("/dashboard/settings?error=oauth_failed", request.url))
    }

    // Create legacy connection (backward compatible)
    await EmailConnectionService.createGmailConnection({
      organizationId,
      email: userInfo.data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000)
    })

    // Create new EmailAccount entry
    if (userId) {
      await EmailAccountService.createAccount({
        userId,
        organizationId,
        provider: EmailProvider.GMAIL,
        email: userInfo.data.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope as string) || undefined,
      })
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings?success=gmail_connected", request.url)
    )
  } catch (error) {
    console.error("Gmail OAuth error:", error)
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=oauth_error", request.url)
    )
  }
}

