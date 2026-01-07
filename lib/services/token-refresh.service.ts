import { EmailConnectionService } from "./email-connection.service"
import { ConnectedEmailAccount } from "@prisma/client"

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
}

