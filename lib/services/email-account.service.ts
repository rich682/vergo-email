import { prisma } from "@/lib/prisma"
import { EmailAccount, EmailProvider } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/encryption"

export class EmailAccountService {
  static async createAccount(data: {
    userId: string
    organizationId: string
    provider: EmailProvider
    email: string
    accessToken?: string
    refreshToken?: string
    tokenExpiresAt?: Date | null
    scopes?: string
  }): Promise<EmailAccount> {
    const encryptedAccessToken = data.accessToken ? encrypt(data.accessToken) : null
    const encryptedRefreshToken = data.refreshToken ? encrypt(data.refreshToken) : null

    const existingCount = await prisma.emailAccount.count({
      where: {
        organizationId: data.organizationId,
        isActive: true,
      },
    })

    return prisma.emailAccount.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        provider: data.provider,
        email: data.email,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt || null,
        scopes: data.scopes || null,
        isPrimary: existingCount === 0,
        isActive: true,
      },
    })
  }

  static async listForUser(userId: string, organizationId: string): Promise<EmailAccount[]> {
    return prisma.emailAccount.findMany({
      where: {
        userId,
        organizationId,
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }],
    })
  }

  static async listForOrganization(organizationId: string): Promise<EmailAccount[]> {
    return prisma.emailAccount.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }],
    })
  }

  static async getById(id: string, organizationId: string): Promise<EmailAccount | null> {
    return prisma.emailAccount.findFirst({
      where: { id, organizationId, isActive: true },
    })
  }

  static async getFirstActive(organizationId: string): Promise<EmailAccount | null> {
    return prisma.emailAccount.findFirst({
      where: { organizationId, isActive: true },
      orderBy: [{ createdAt: "asc" }],
    })
  }

  static async setPrimary(id: string, organizationId: string): Promise<void> {
    await prisma.emailAccount.updateMany({
      where: { organizationId, isPrimary: true },
      data: { isPrimary: false },
    })

    await prisma.emailAccount.update({
      where: { id },
      data: { isPrimary: true },
    })
  }

  static async deactivate(id: string, organizationId: string): Promise<void> {
    const wasPrimary = await prisma.emailAccount.findFirst({
      where: { id, organizationId, isActive: true, isPrimary: true },
      select: { id: true },
    })

    await prisma.emailAccount.updateMany({
      where: { id, organizationId },
      data: { isActive: false, isPrimary: false },
    })

    if (wasPrimary) {
      const next = await prisma.emailAccount.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: "asc" },
      })
      if (next) {
        await prisma.emailAccount.update({
          where: { id: next.id },
          data: { isPrimary: true },
        })
      }
    }
  }

  static async updateTokens(id: string, data: { accessToken?: string; refreshToken?: string; tokenExpiresAt?: Date | null }) {
    return prisma.emailAccount.update({
      where: { id },
      data: {
        accessToken: data.accessToken ? encrypt(data.accessToken) : undefined,
        refreshToken: data.refreshToken ? encrypt(data.refreshToken) : undefined,
        tokenExpiresAt: data.tokenExpiresAt ?? undefined,
      },
    })
  }

  static async getDecryptedCredentials(id: string): Promise<{
    accessToken?: string
    refreshToken?: string
  } | null> {
    const account = await prisma.emailAccount.findUnique({ where: { id } })
    if (!account) return null
    return {
      accessToken: account.accessToken ? decrypt(account.accessToken) : undefined,
      refreshToken: account.refreshToken ? decrypt(account.refreshToken) : undefined,
    }
  }
}

