import { EmailConnectionService } from "./email-connection.service"
import { EmailAccountService } from "./email-account.service"
import { ConnectedEmailAccount, EmailAccount, EmailProvider } from "@prisma/client"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"

export class TokenRefreshService {
  static async ensureValidToken(
    account: ConnectedEmailAccount
  ): Promise<ConnectedEmailAccount> {
    if (account.provider !== "GMAIL") {
      return account
    }

    // Check if token is expired or will expire in the next 5 minutes
    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    if (
      !account.tokenExpiresAt ||
      account.tokenExpiresAt <= fiveMinutesFromNow
    ) {
      // Token is expired or about to expire, refresh it
      return await EmailConnectionService.refreshGmailToken(account.id)
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

  static async ensureValidEmailAccount(
    account: EmailAccount
  ): Promise<EmailAccount> {
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

  static async refreshEmailAccountIfNeeded(
    accountId: string
  ): Promise<EmailAccount> {
    const { prisma } = await import("@/lib/prisma")
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      throw new Error("EmailAccount not found")
    }
    return this.ensureValidEmailAccount(account)
  }
}

