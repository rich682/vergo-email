/**
 * POST /api/auth/signup
 * Self-service signup - creates a new organization and admin user
 * Sends verification email
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { AuthEmailService } from "@/lib/services/auth-email.service"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companyName, email, password, firstName, lastName, name } = body

    // Validate required fields
    if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
      return NextResponse.json(
        { error: "Company name must be at least 2 characters" },
        { status: 400 }
      )
    }

    // Validate first and last name (required for clean data)
    if (!firstName || typeof firstName !== "string" || firstName.trim().length < 1) {
      return NextResponse.json(
        { error: "First name is required" },
        { status: 400 }
      )
    }

    if (!lastName || typeof lastName !== "string" || lastName.trim().length < 1) {
      return NextResponse.json(
        { error: "Last name is required" },
        { status: 400 }
      )
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      )
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    // Combine first and last name for storage
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    const normalizedEmail = email.toLowerCase().trim()
    const trimmedCompanyName = companyName.trim()

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      )
    }

    // Generate a unique slug from company name
    const baseSlug = trimmedCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50)

    // Check if slug exists and make it unique if needed
    let slug = baseSlug
    let slugSuffix = 1
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${slugSuffix}`
      slugSuffix++
    }

    // Generate verification token
    const verificationToken = AuthEmailService.generateToken()
    const tokenExpiresAt = AuthEmailService.getTokenExpiry("verification")

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create organization, admin user, and starter data in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: trimmedCompanyName,
          slug
        }
      })

      // Create admin user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: fullName,
          role: "ADMIN",
          organizationId: organization.id,
          emailVerified: false,
          verificationToken,
          tokenExpiresAt
        }
      })

      // Create "Onboarding" group for quick testing
      const onboardingGroup = await tx.group.create({
        data: {
          name: "Onboarding",
          description: "New team members for onboarding",
          color: "#10b981", // Green color
          organizationId: organization.id
        }
      })

      // Create the user as a contact/stakeholder (so they can send requests to themselves)
      const userEntity = await tx.entity.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          contactType: "EMPLOYEE",
          organizationId: organization.id
        }
      })

      // Add the user entity to the Onboarding group
      await tx.entityGroup.create({
        data: {
          entityId: userEntity.id,
          groupId: onboardingGroup.id
        }
      })

      return { organization, user, onboardingGroup, userEntity }
    })

    // Send verification email (use first name for friendly greeting)
    const emailResult = await AuthEmailService.sendVerificationEmail(
      normalizedEmail,
      verificationToken,
      firstName.trim()
    )

    if (!emailResult.success) {
      console.error(`[Signup] Failed to send verification email to ${normalizedEmail}:`, emailResult.error)
    } else {
      console.log(`[Signup] Verification email sent to ${normalizedEmail}`)
    }

    console.log(`[Signup] New organization created: ${result.organization.name} (${result.organization.id})`)

    return NextResponse.json({
      success: true,
      message: "Account created! Please check your email to verify your account.",
      emailSent: emailResult.success,
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("[Signup] Error:", error)
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    )
  }
}
