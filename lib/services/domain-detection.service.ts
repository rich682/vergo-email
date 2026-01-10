import { prisma } from "@/lib/prisma"

export class DomainDetectionService {
  /**
   * Get the organization's email domain.
   * Checks in order:
   * 1. organization.emailDomain (if set)
   * 2. Primary connected email account domain
   * 3. User emails in the organization
   * Returns null if cannot determine
   */
  static async getOrganizationDomain(organizationId: string): Promise<string | null> {
    // Check if organization has emailDomain set
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { emailDomain: true }
    })

    if (organization?.emailDomain) {
      return organization.emailDomain
    }

    // Check primary connected email account
    const primaryAccount = await prisma.connectedEmailAccount.findFirst({
      where: {
        organizationId,
        isPrimary: true,
        isActive: true
      },
      select: { email: true }
    })

    if (primaryAccount?.email) {
      const domain = this.extractDomain(primaryAccount.email)
      if (domain) {
        // Optionally update organization.emailDomain for future use
        await prisma.organization.update({
          where: { id: organizationId },
          data: { emailDomain: domain }
        })
        return domain
      }
    }

    // Check any connected email account
    const anyAccount = await prisma.connectedEmailAccount.findFirst({
      where: {
        organizationId,
        isActive: true
      },
      select: { email: true }
    })

    if (anyAccount?.email) {
      const domain = this.extractDomain(anyAccount.email)
      if (domain) {
        return domain
      }
    }

    // Check user emails in the organization
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { email: true },
      take: 10
    })

    // Find most common domain
    const domainCounts = new Map<string, number>()
    for (const user of users) {
      if (user.email) {
        const domain = this.extractDomain(user.email)
        if (domain) {
          domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)
        }
      }
    }

    if (domainCounts.size > 0) {
      // Get most common domain
      let maxCount = 0
      let mostCommonDomain: string | null = null
      for (const [domain, count] of domainCounts.entries()) {
        if (count > maxCount) {
          maxCount = count
          mostCommonDomain = domain
        }
      }
      return mostCommonDomain
    }

    return null
  }

  /**
   * Extract domain from email address
   */
  static extractDomain(email: string): string | null {
    if (!email || !email.includes("@")) {
      return null
    }
    const parts = email.split("@")
    if (parts.length !== 2) {
      return null
    }
    return parts[1].toLowerCase().trim()
  }

  /**
   * Check if an email belongs to the organization (internal)
   */
  static async isInternalEmail(
    email: string,
    organizationId: string
  ): Promise<boolean> {
    if (!email) {
      return false
    }

    const orgDomain = await this.getOrganizationDomain(organizationId)
    if (!orgDomain) {
      return false
    }

    const emailDomain = this.extractDomain(email)
    if (!emailDomain) {
      return false
    }

    return emailDomain === orgDomain
  }
}










