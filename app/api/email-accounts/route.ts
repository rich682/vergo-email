import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { UserRole } from "@prisma/client"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const userId = session.user.id
  const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
  const isAdmin = userRole === UserRole.ADMIN

  // Get all accounts with owner info
  const accounts = await EmailConnectionService.findByOrganizationWithOwner(
    session.user.organizationId
  )
  
  // Map to safe response format with ownership info
  const safeAccounts = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    provider: account.provider,
    isPrimary: account.isPrimary,
    isActive: account.isActive,
    createdAt: account.createdAt,
    lastSyncAt: account.lastSyncAt,
    // Include owner info
    userId: account.userId,
    isOwn: account.userId === userId,  // Is this the current user's account?
    owner: account.user ? {
      id: account.user.id,
      name: account.user.name,
      email: account.user.email
    } : null  // null = legacy account (not assigned to a user)
  }))

  // Non-admins only see their own accounts + unassigned (legacy) accounts
  // Admins see all accounts
  const filteredAccounts = isAdmin 
    ? safeAccounts 
    : safeAccounts.filter(a => a.isOwn || a.userId === null)

  return NextResponse.json(filteredAccounts)
}
