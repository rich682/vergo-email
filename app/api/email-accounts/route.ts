import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Use ConnectedEmailAccount - this is the table used by email sync
  const accounts = await EmailConnectionService.findByOrganization(
    session.user.organizationId
  )
  
  const safeAccounts = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    provider: account.provider,
    isPrimary: account.isPrimary,
    isActive: account.isActive,
    createdAt: account.createdAt,
    lastSyncAt: account.lastSyncAt,
  }))

  return NextResponse.json(safeAccounts)
}
