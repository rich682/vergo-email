/**
 * Organization Users API Endpoints
 * 
 * GET /api/org/users - List users in organization (admin-only)
 * POST /api/org/users - Create/invite a user (admin-only)
 * 
 * Authorization: Admin only
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

/**
 * GET /api/org/users - List users in organization
 * Admin-only endpoint
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
    const userRole = (session.user as any).role as UserRole

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    // Fetch all users in the organization
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,  // Used to determine "pending" status
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    })

    // Map users with computed status
    // A user is "pending" if they have an empty or placeholder password
    const usersWithStatus = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // Status: "active" if they have a real password, "pending" otherwise
      status: user.passwordHash && user.passwordHash.length > 10 ? "active" : "pending",
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    }))

    return NextResponse.json({
      success: true,
      users: usersWithStatus
    })

  } catch (error: any) {
    console.error("List org users error:", error)
    return NextResponse.json(
      { error: "Failed to list users", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/org/users - Create/invite a user
 * Admin-only endpoint
 * 
 * Creates a user record with status "pending" (empty password)
 * For demo purposes, no email is sent - user appears as "Invited/Pending"
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
    const userRole = (session.user as any).role as UserRole

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
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER]
    const userRoleToSet = role && validRoles.includes(role) ? role : UserRole.MEMBER

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
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

    // Create user with empty password (pending status)
    // User cannot login until password is set
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        role: userRoleToSet,
        organizationId,
        passwordHash: ""  // Empty = pending, cannot login
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

    return NextResponse.json({
      success: true,
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
      { error: "Failed to create user", message: error.message },
      { status: 500 }
    )
  }
}
