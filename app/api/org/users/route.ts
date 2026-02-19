/**
 * Organization Users API Endpoints
 * 
 * GET /api/org/users - List users in organization
 *   - Admins: See all users with email account info
 *   - Non-admins: See only their own user record (for inbox connection)
 * POST /api/org/users - Create/invite a user (admin-only)
 * 
 * Authorization: Authenticated users (self-view) or Admin (all users)
 */

import { NextRequest, NextResponse } from "next/server"
import { normalizeEmail } from "@/lib/utils/email"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import { AuthEmailService } from "@/lib/services/auth-email.service"
import { isValidEmail } from "@/lib/utils/validate-email"

/**
 * GET /api/org/users - List users in organization
 * - Admins see all users with their connected email accounts
 * - Non-admins see only themselves (to allow inbox connection)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const currentUserId = session.user.id
    const currentUserEmail = session.user.email // Use email as more reliable identifier
    const userRole = session.user.role
    const isAdmin = userRole === UserRole.ADMIN
    

    // Fetch users based on role
    // Admins: all users in org
    // Non-admins: only themselves
    const users = await prisma.user.findMany({
      where: isAdmin
        ? { organizationId, isDebugUser: false }
        : { organizationId, id: currentUserId, isDebugUser: false },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        moduleAccess: true,
        emailVerified: true,  // Used to determine "pending" vs "active" status
        createdAt: true,
        updatedAt: true,
        // Include connected email accounts
        connectedEmailAccounts: {
          where: { isActive: true },
          select: {
            id: true,
            email: true,
            provider: true,
            isPrimary: true,
            isActive: true,
            lastSyncAt: true
          },
          orderBy: { isPrimary: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    // Map users with computed status and email account info
    const usersWithStatus = users.map(user => {
      // Use email comparison as primary (more reliable than ID which can mismatch)
      const isCurrentUser = user.email.toLowerCase() === currentUserEmail?.toLowerCase()
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        moduleAccess: user.moduleAccess || null,
        status: user.emailVerified ? "active" : "pending",
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        // Connected email account (primary or first one)
        connectedEmail: user.connectedEmailAccounts[0] || null,
        // All connected accounts (for admins who want to see multiple)
        connectedEmailAccounts: user.connectedEmailAccounts,
        // Is this the current user? (for UI to know if they can connect/disconnect)
        isCurrentUser
      }
    })

    return NextResponse.json({
      success: true,
      users: usersWithStatus,
      isAdmin // Let frontend know if user is admin for UI decisions
    })

  } catch (error: any) {
    console.error("List org users error:", error)
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/org/users - Create/invite a user
 * Admin-only endpoint
 * 
 * Creates a user record with status "pending" (empty password)
 * Sends an invitation email with a link to set password
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userRole = session.user.role
    const inviterName = session.user.name || session.user.email

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, role, name } = body

    // Validate email
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = [UserRole.ADMIN, UserRole.MEMBER, UserRole.MANAGER]
    const userRoleToSet = role && validRoles.includes(role) ? role : UserRole.MEMBER

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) || "" }
    })

    if (existingUser) {
      // Check if they're in the same org
      if (existingUser.organizationId === organizationId) {
        return NextResponse.json(
          { error: "User already exists in this organization" },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: "Email is already registered with another organization" },
          { status: 400 }
        )
      }
    }

    // Get organization name for the invite email
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })

    // Generate invite token
    const inviteToken = AuthEmailService.generateToken()
    const tokenExpiresAt = AuthEmailService.getTokenExpiry("invite")

    // Create user with empty password (pending status) and invite token
    const newUser = await prisma.user.create({
      data: {
        email: normalizeEmail(email) || "",
        name: name?.trim() || null,
        role: userRoleToSet,
        organizationId,
        passwordHash: "",  // Empty = pending, cannot login
        verificationToken: inviteToken,
        tokenExpiresAt: tokenExpiresAt,
        emailVerified: false
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // Send invitation email
    const emailResult = await AuthEmailService.sendTeamInviteEmail(
      newUser.email,
      inviteToken,
      organization?.name || "your team",
      inviterName,
      userRoleToSet
    )

    if (!emailResult.success) {
      console.error(`[InviteUser] Failed to send invite email to ${newUser.email}:`, emailResult.error)
      // Don't fail the request - user is created, they just need a resend
    } else {
      console.log(`[InviteUser] Invite email sent to ${newUser.email}`)
    }

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
      user: {
        ...newUser,
        status: "pending",
        createdAt: newUser.createdAt.toISOString(),
        updatedAt: newUser.updatedAt.toISOString()
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("Create org user error:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}
