import { NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { verifyOAuthState } from "@/lib/utils/oauth-state"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // JSON with organizationId/userId

  console.log("[Gmail OAuth Callback] Starting callback processing")
  console.log("[Gmail OAuth Callback] Has code:", !!code)
  console.log("[Gmail OAuth Callback] Has state:", !!state)
  console.log("[Gmail OAuth Callback] Raw state value:", state)

  if (!code || !state) {
    console.error("[Gmail OAuth Callback] Missing code or state - code:", !!code, "state:", !!state)
    return NextResponse.redirect(
      new URL("/dashboard/settings/team?error=oauth_failed", request.url)
    )
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )

    console.log("[Gmail OAuth Callback] Exchanging code for tokens...")
    const { tokens } = await oauth2Client.getToken(code)
    console.log("[Gmail OAuth Callback] Got tokens - access:", !!tokens.access_token, "refresh:", !!tokens.refresh_token)

    if (!tokens.access_token || !tokens.refresh_token) {
      console.error("[Gmail OAuth Callback] Missing tokens")
      return NextResponse.redirect(
        new URL("/dashboard/settings/team?error=no_tokens", request.url)
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
    console.log("[Gmail OAuth Callback] Got user email:", userInfo.data.email)

    if (!userInfo.data.email) {
      console.error("[Gmail OAuth Callback] No email in user info")
      return NextResponse.redirect(
        new URL("/dashboard/settings/team?error=no_email", request.url)
      )
    }

    // Verify and parse HMAC-signed state (also handles legacy unsigned state)
    const parsed = verifyOAuthState(state)
    if (!parsed) {
      console.error("[Gmail OAuth Callback] State verification failed - possible tampering")
      return NextResponse.redirect(new URL("/dashboard/settings/team?error=invalid_state", request.url))
    }
    const organizationId: string | null = parsed.organizationId || null
    const userId: string | null = parsed.userId || null

    // Get session
    const session = await getServerSession(authOptions)
    console.log("[Gmail OAuth Callback] Session user:", {
      hasSession: !!session,
      userId: session?.user?.id,
      orgId: session?.user?.organizationId
    })

    // Validate session exists
    if (!session?.user?.id || !session.user.organizationId) {
      console.error("[Gmail OAuth Callback] No session - redirecting to signin")
      return NextResponse.redirect(new URL("/auth/signin", request.url))
    }

    // Validate user ID matches
    if (userId && session.user.id !== userId) {
      console.error("[Gmail OAuth Callback] User ID mismatch!", {
        stateUserId: userId,
        sessionUserId: session.user.id
      })
      return NextResponse.redirect(new URL("/dashboard/settings/team?error=user_mismatch", request.url))
    }

    // Validate organization ID matches
    if (organizationId && session.user.organizationId !== organizationId) {
      console.error("[Gmail OAuth Callback] Org ID mismatch!", {
        stateOrgId: organizationId,
        sessionOrgId: session.user.organizationId
      })
      return NextResponse.redirect(new URL("/dashboard/settings/team?error=org_mismatch", request.url))
    }

    // If we couldn't parse state at all, fail
    if (!organizationId) {
      console.error("[Gmail OAuth Callback] Could not extract organizationId from state")
      return NextResponse.redirect(new URL("/dashboard/settings/team?error=invalid_state", request.url))
    }

    console.log("[Gmail OAuth Callback] Validation passed, creating connection...")

    // Create connection in ConnectedEmailAccount (used by email sync)
    // Associate with the logged-in user so they can send from their own inbox
    const connectedAccount = await EmailConnectionService.createGmailConnection({
      organizationId,
      userId: session.user.id,  // Associate account with the connecting user
      email: userInfo.data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000)
    })
    
    console.log(`[Gmail OAuth] Created ConnectedEmailAccount: ${connectedAccount.id} for ${userInfo.data.email}`)

    // Attempt to set up Gmail watch for push notifications (optional - won't fail if not configured)
    try {
      const { GmailWatchService } = await import("@/lib/services/gmail-watch.service")
      await GmailWatchService.setupWatch(connectedAccount.id)
      console.log(`[Gmail OAuth] Successfully set up watch for account ${connectedAccount.id}`)
    } catch (watchError: any) {
      // Log but don't fail - sync service will handle replies as fallback
      console.warn(`[Gmail OAuth] Could not set up watch for account ${connectedAccount.id}:`, watchError.message)
      console.warn(`[Gmail OAuth] Push notifications not available, but sync service will still work`)
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings/team?success=gmail_connected", request.url)
    )
  } catch (error) {
    console.error("Gmail OAuth error:", error)
    return NextResponse.redirect(
      new URL("/dashboard/settings/team?error=oauth_error", request.url)
    )
  }
}

