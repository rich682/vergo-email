import { prisma } from "@/lib/prisma"
import { ConnectedEmailAccount, EmailProvider } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/encryption"
import { google } from "googleapis"
import { OAuth2Client } from "google-auth-library"

export class EmailConnectionService {
  static async createGmailConnection(data: {
    organizationId: string
    email: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
  }): Promise<ConnectedEmailAccount> {
    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(data.accessToken)
    const encryptedRefreshToken = encrypt(data.refreshToken)

    // If this is the first connection, make it primary
    const existingConnections = await prisma.connectedEmailAccount.count({
      where: {
        organizationId: data.organizationId,
        isActive: true
      }
    })

    return prisma.connectedEmailAccount.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        provider: "GMAIL",
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        isPrimary: existingConnections === 0,
        isActive: true
      }
    })
  }

  static async createMicrosoftConnection(data: {
    organizationId: string
    email: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
  }): Promise<ConnectedEmailAccount> {
    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(data.accessToken)
    const encryptedRefreshToken = encrypt(data.refreshToken)

    // If this is the first connection, make it primary
    const existingConnections = await prisma.connectedEmailAccount.count({
      where: {
        organizationId: data.organizationId,
        isActive: true
      }
    })

    return prisma.connectedEmailAccount.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        provider: "MICROSOFT",
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        isPrimary: existingConnections === 0,
        isActive: true
      }
    })
  }

  static async createSMTPConnection(data: {
    organizationId: string
    email: string
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPassword: string
    smtpSecure: boolean
  }): Promise<ConnectedEmailAccount> {
    const encryptedPassword = encrypt(data.smtpPassword)

    const existingConnections = await prisma.connectedEmailAccount.count({
      where: {
        organizationId: data.organizationId,
        isActive: true
      }
    })

    return prisma.connectedEmailAccount.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        provider: "GENERIC_SMTP",
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPassword: encryptedPassword,
        smtpSecure: data.smtpSecure,
        isPrimary: existingConnections === 0,
        isActive: true
      }
    })
  }

  static async getPrimaryAccount(
    organizationId: string
  ): Promise<ConnectedEmailAccount | null> {
    return prisma.connectedEmailAccount.findFirst({
      where: {
        organizationId,
        isPrimary: true,
        isActive: true
      }
    })
  }

  static async getById(
    id: string,
    organizationId: string
  ): Promise<ConnectedEmailAccount | null> {
    return prisma.connectedEmailAccount.findFirst({
      where: { id, organizationId, isActive: true }
    })
  }

  static async getFirstActive(
    organizationId: string
  ): Promise<ConnectedEmailAccount | null> {
    return prisma.connectedEmailAccount.findFirst({
      where: { organizationId, isActive: true },
      orderBy: [{ createdAt: "asc" }]
    })
  }

  static async updateTokens(
    id: string,
    data: { accessToken?: string; refreshToken?: string; tokenExpiresAt?: Date | null }
  ): Promise<ConnectedEmailAccount> {
    return prisma.connectedEmailAccount.update({
      where: { id },
      data: {
        accessToken: data.accessToken ? encrypt(data.accessToken) : undefined,
        refreshToken: data.refreshToken ? encrypt(data.refreshToken) : undefined,
        tokenExpiresAt: data.tokenExpiresAt ?? undefined
      }
    })
  }

  static async getGmailClient(
    accountId: string
  ): Promise<OAuth2Client | null> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "GMAIL") {
      return null
    }

    if (!account.accessToken || !account.refreshToken) {
      return null
    }

    const oauth2Client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      access_token: decrypt(account.accessToken),
      refresh_token: decrypt(account.refreshToken),
      expiry_date: account.tokenExpiresAt?.getTime()
    })

    return oauth2Client
  }

  static async refreshGmailToken(
    accountId: string
  ): Promise<ConnectedEmailAccount> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "GMAIL") {
      throw new Error("Account not found or not a Gmail account")
    }

    if (!account.refreshToken) {
      throw new Error("No refresh token available")
    }

    const oauth2Client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      refresh_token: decrypt(account.refreshToken)
    })

    const { credentials } = await oauth2Client.refreshAccessToken()

    // Update account with new tokens
    return prisma.connectedEmailAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(credentials.access_token || ""),
        refreshToken: credentials.refresh_token
          ? encrypt(credentials.refresh_token)
          : account.refreshToken,
        tokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null
      }
    })
  }

  static async findByOrganization(
    organizationId: string
  ): Promise<ConnectedEmailAccount[]> {
    return prisma.connectedEmailAccount.findMany({
      where: { organizationId },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "desc" }
      ]
    })
  }

  static async setPrimary(
    accountId: string,
    organizationId: string
  ): Promise<void> {
    // Unset all primary accounts for this organization
    await prisma.connectedEmailAccount.updateMany({
      where: {
        organizationId,
        isPrimary: true
      },
      data: {
        isPrimary: false
      }
    })

    // Set this account as primary
    await prisma.connectedEmailAccount.update({
      where: {
        id: accountId,
        organizationId
      },
      data: {
        isPrimary: true
      }
    })
  }

  static async delete(
    accountId: string,
    organizationId: string
  ): Promise<void> {
    await prisma.connectedEmailAccount.delete({
      where: {
        id: accountId,
        organizationId
      }
    })
  }

  static async getDecryptedCredentials(
    accountId: string
  ): Promise<{
    accessToken?: string
    refreshToken?: string
    smtpPassword?: string
  } | null> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account) return null

    const result: any = {}

    if (account.accessToken) {
      result.accessToken = decrypt(account.accessToken)
    }

    if (account.refreshToken) {
      result.refreshToken = decrypt(account.refreshToken)
    }

    if (account.smtpPassword) {
      result.smtpPassword = decrypt(account.smtpPassword)
    }

    return result
  }

  /**
   * Get a valid Microsoft Graph access token for the given account.
   * Automatically refreshes the token if it's expired or about to expire.
   */
  static async getMicrosoftAccessToken(
    accountId: string
  ): Promise<{ token: string; account: ConnectedEmailAccount } | null> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "MICROSOFT") {
      return null
    }

    if (!account.accessToken || !account.refreshToken) {
      return null
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = Date.now()
    const expiry = account.tokenExpiresAt?.getTime() || 0
    const needsRefresh = expiry < now + 5 * 60 * 1000

    if (needsRefresh) {
      const refreshedAccount = await this.refreshMicrosoftToken(accountId)
      return {
        token: decrypt(refreshedAccount.accessToken!),
        account: refreshedAccount
      }
    }

    return {
      token: decrypt(account.accessToken),
      account
    }
  }

  /**
   * Refresh Microsoft OAuth token using the refresh token.
   */
  static async refreshMicrosoftToken(
    accountId: string
  ): Promise<ConnectedEmailAccount> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "MICROSOFT") {
      throw new Error("Account not found or not a Microsoft account")
    }

    if (!account.refreshToken) {
      throw new Error("No refresh token available for Microsoft account")
    }

    const tenant = process.env.MS_TENANT_ID || "common"
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID || "",
      client_secret: process.env.MS_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
      scope: "offline_access Mail.Send Mail.Read Mail.ReadBasic Contacts.Read",
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Microsoft Token Refresh] Failed for account ${accountId}:`, errorText)
      
      // Check if this is an invalid_grant error (refresh token expired/revoked)
      if (errorText.includes("invalid_grant") || errorText.includes("AADSTS")) {
        // Mark account as needing re-authorization
        await prisma.connectedEmailAccount.update({
          where: { id: accountId },
          data: { isActive: false }
        })
        throw new Error(`Microsoft account needs to be reconnected. Please disconnect and reconnect the account in Settings. Error: ${errorText}`)
      }
      
      throw new Error(`Failed to refresh Microsoft token: ${errorText}`)
    }

    const data = await response.json()
    const expiresInMs = data.expires_in ? Number(data.expires_in) * 1000 : 3600 * 1000

    // Update account with new tokens
    return prisma.connectedEmailAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(data.access_token),
        refreshToken: data.refresh_token
          ? encrypt(data.refresh_token)
          : account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + expiresInMs)
      }
    })
  }

  /**
   * Create a Microsoft connection for an organization.
   */
  static async createMicrosoftConnection(data: {
    organizationId: string
    email: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
  }): Promise<ConnectedEmailAccount> {
    const encryptedAccessToken = encrypt(data.accessToken)
    const encryptedRefreshToken = encrypt(data.refreshToken)

    const existingConnections = await prisma.connectedEmailAccount.count({
      where: {
        organizationId: data.organizationId,
        isActive: true
      }
    })

    return prisma.connectedEmailAccount.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        provider: "MICROSOFT",
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        isPrimary: existingConnections === 0,
        isActive: true
      }
    })
  }
}











