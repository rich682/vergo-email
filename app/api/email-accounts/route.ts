import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { EmailAccountService } from "@/lib/services/email-account.service"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Prefer new EmailAccount model (user-scoped), fall back to legacy ConnectedEmailAccount
  const emailAccounts = await EmailAccountService.listForUser(
    session.user.id,
    session.user.organizationId
  )

  if (emailAccounts.length > 0) {
    const safe = emailAccounts.map((a) => ({
      id: a.id,
      email: a.email,
      provider: a.provider,
      isPrimary: a.isPrimary,
      isActive: a.isActive,
      createdAt: a.createdAt,
      source: "emailAccount",
    }))
    return NextResponse.json(safe)
  }

  const legacyAccounts = await EmailConnectionService.findByOrganization(
    session.user.organizationId
  )
  const safeLegacy = legacyAccounts.map((account) => ({
    id: account.id,
    email: account.email,
    provider: account.provider,
    isPrimary: account.isPrimary,
    isActive: account.isActive,
    createdAt: account.createdAt,
    source: "connectedEmailAccount",
  }))

  return NextResponse.json(safeLegacy)
}









