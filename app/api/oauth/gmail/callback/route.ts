import { NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // organizationId

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

    // Create connection
    await EmailConnectionService.createGmailConnection({
      organizationId: state,
      email: userInfo.data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000) // Default to 1 hour if not provided
    })

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

