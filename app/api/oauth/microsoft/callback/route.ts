import { NextResponse } from "next/server"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
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
      scope: "offline_access User.Read Mail.Send Mail.Read Mail.ReadBasic Contacts.Read",
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
    // Request specific fields to ensure we get the actual email address
    console.log("Microsoft OAuth: Fetching user profile...")
    const meResp = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,otherMails,proxyAddresses", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    
    if (!meResp.ok) {
      const meError = await meResp.text()
      console.error("Microsoft OAuth: Failed to fetch user profile:", meError)
      return NextResponse.redirect(new URL("/dashboard/settings?error=profile_fetch_failed", request.url))
    }
    
    const me = await meResp.json()
    console.log("Microsoft OAuth: User profile response:", JSON.stringify({
      id: me.id,
      displayName: me.displayName,
      mail: me.mail,
      userPrincipalName: me.userPrincipalName,
      otherMails: me.otherMails,
      proxyAddresses: me.proxyAddresses
    }))
    
    // Determine the best email to use:
    // For personal Microsoft accounts (outlook.com, hotmail.com, live.com), userPrincipalName IS the email
    // For work/school accounts, mail or proxyAddresses is more reliable
    let email: string | null = null
    
    const upn = me.userPrincipalName || ""
    const isPersonalAccount = upn.includes("@outlook.com") || 
                              upn.includes("@hotmail.com") || 
                              upn.includes("@live.com") ||
                              upn.includes("@msn.com")
    
    if (isPersonalAccount) {
      // For personal accounts, userPrincipalName IS the email address
      email = upn
      console.log("Microsoft OAuth: Personal account detected, using userPrincipalName:", email)
    } else {
      // For work/school accounts, try proxyAddresses first, then mail, then UPN
      
      // Try to get primary SMTP from proxyAddresses
      if (me.proxyAddresses && Array.isArray(me.proxyAddresses)) {
        const primarySmtp = me.proxyAddresses.find((addr: string) => addr.startsWith("SMTP:"))
        if (primarySmtp) {
          email = primarySmtp.replace("SMTP:", "")
          console.log("Microsoft OAuth: Using primary SMTP from proxyAddresses:", email)
        }
      }
      
      // Fall back to mail field
      if (!email && me.mail) {
        email = me.mail
        console.log("Microsoft OAuth: Using mail field:", email)
      }
      
      // Fall back to userPrincipalName only if it looks like an email
      if (!email && upn && upn.includes("@")) {
        email = upn
        console.log("Microsoft OAuth: Using userPrincipalName:", email)
      }
    }
    
    if (!email) {
      console.error("Microsoft OAuth: No email found in user profile:", me)
      return NextResponse.redirect(new URL("/dashboard/settings?error=no_email_in_profile", request.url))
    }

    console.log("Microsoft OAuth: Creating email account for:", email)
    const expiresInMs = tokenData.expires_in ? Number(tokenData.expires_in) * 1000 : 3600 * 1000

    // Create connection in ConnectedEmailAccount (used by email sync)
    // Associate with the logged-in user so they can send from their own inbox
    const connectedAccount = await EmailConnectionService.createMicrosoftConnection({
      organizationId,
      userId: session.user.id,  // Associate account with the connecting user
      email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + expiresInMs),
    })

    console.log(`[Microsoft OAuth] Created ConnectedEmailAccount: ${connectedAccount.id} for ${email}`)
    return NextResponse.redirect(new URL("/dashboard/settings?success=microsoft_connected", request.url))
  } catch (error: any) {
    console.error("Microsoft OAuth unexpected error:", error)
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=unexpected_error&message=${encodeURIComponent(error.message || "Unknown error")}`, request.url)
    )
  }
}

