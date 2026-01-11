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
}











