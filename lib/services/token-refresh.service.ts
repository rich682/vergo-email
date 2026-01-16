import { EmailConnectionService } from "./email-connection.service"
import { ConnectedEmailAccount, EmailProvider } from "@prisma/client"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"

export class TokenRefreshService {
  static async ensureValidToken(
    account: ConnectedEmailAccount
  ): Promise<ConnectedEmailAccount> {
    // Check if token is expired or will expire in the next 5 minutes
    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    if (
      !account.tokenExpiresAt ||
      account.tokenExpiresAt <= fiveMinutesFromNow
    ) {
      // Token is expired or about to expire, refresh it
      if (account.provider === "GMAIL") {
        return await EmailConnectionService.refreshGmailToken(account.id)
      } else if (account.provider === "MICROSOFT") {
        return await EmailConnectionService.refreshMicrosoftToken(account.id)
      }
    }

    return account
  }

  static async refreshIfNeeded(
    accountId: string
  ): Promise<ConnectedEmailAccount> {
    const { prisma } = await import("@/lib/prisma")
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account) {
      throw new Error("Account not found")
    }

    return this.ensureValidToken(account)
  }

  static async ensureValidConnectedAccount(
    account: ConnectedEmailAccount
  ): Promise<ConnectedEmailAccount> {
    if (account.provider === EmailProvider.GMAIL) {
      const provider = new GmailProvider()
      return provider.refreshToken(account)
    }
    if (account.provider === EmailProvider.MICROSOFT) {
      const provider = new MicrosoftProvider()
      return provider.refreshToken(account)
    }
    return account
  }

  static async refreshConnectedAccountIfNeeded(
    accountId: string
  ): Promise<ConnectedEmailAccount> {
    const { prisma } = await import("@/lib/prisma")
    const account = await prisma.connectedEmailAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      throw new Error("ConnectedEmailAccount not found")
    }
    return this.ensureValidConnectedAccount(account)
  }
}

