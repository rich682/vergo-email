/**
 * POST /api/auth/signup
 * Self-service signup - creates a new organization and admin user
 * Sends verification email
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { AuthEmailService } from "@/lib/services/auth-email.service"
import { isValidEmail } from "@/lib/utils/validate-email"
import { normalizeEmail } from "@/lib/utils/email"
import { validateOrigin } from "@/lib/utils/csrf"
import { validatePassword } from "@/lib/utils/password-validation"

// ── Simple in-memory rate limiter (per IP) ──────────────────────────────
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_SIGNUPS_PER_WINDOW = 3
const signupAttempts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = signupAttempts.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    signupAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > MAX_SIGNUPS_PER_WINDOW
}

// Clean up old entries periodically (avoid memory leak)
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of signupAttempts.entries()) {
    if (now - entry.windowStart > RATE_WINDOW_MS) {
      signupAttempts.delete(ip)
    }
  }
}, 10 * 60 * 1000) // every 10 minutes

export async function POST(request: NextRequest) {
  // CSRF protection
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  try {
    // ── Rate limiting ──────────────────────────────────────────────────
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown"
    if (isRateLimited(ip)) {
      console.warn(`[Signup] Rate limited IP: ${ip}`)
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { companyName, email, password, firstName, lastName, name, website, _t } = body

    // ── Anti-bot: honeypot check ───────────────────────────────────────
    if (website) {
      // Real users never see this field; bots auto-fill it
      console.warn(`[Signup] Honeypot triggered for ${email} from ${ip}`)
      // Return success to not tip off the bot, but do nothing
      return NextResponse.json({
        success: true,
        message: "Account created! Please check your email to verify your account.",
        emailSent: true,
      }, { status: 201 })
    }

    // ── Anti-bot: timing check ─────────────────────────────────────────
    if (_t && typeof _t === "number") {
      const elapsed = Date.now() - _t
      if (elapsed < 3000) {
        // Form filled in under 3 seconds = almost certainly a bot
        console.warn(`[Signup] Timing check failed for ${email} (${elapsed}ms) from ${ip}`)
        return NextResponse.json({
          success: true,
          message: "Account created! Please check your email to verify your account.",
          emailSent: true,
        }, { status: 201 })
      }
    }

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

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      )
    }

    const pwCheck = validatePassword(password)
    if (!pwCheck.valid) {
      return NextResponse.json(
        { error: pwCheck.error },
        { status: 400 }
      )
    }

    // Combine first and last name for storage
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    const normalizedEmail = normalizeEmail(email) || ""
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

      // Create debug/test users only when explicitly enabled (never in production)
      if (process.env.ENABLE_DEBUG_USERS === "true") {
        const debugPasswordHash = await bcrypt.hash(process.env.DEBUG_USER_PASSWORD || crypto.randomUUID(), 10)
        const debugRoles = ["ADMIN", "MANAGER", "MEMBER"] as const
        for (const debugRole of debugRoles) {
          await tx.user.create({
            data: {
              email: `debug-${debugRole.toLowerCase()}@${organization.id}.vergo.local`,
              passwordHash: debugPasswordHash,
              name: `Debug ${debugRole.charAt(0) + debugRole.slice(1).toLowerCase()}`,
              role: debugRole,
              organizationId: organization.id,
              emailVerified: true,
              isDebugUser: true,
              onboardingCompleted: true,
            }
          })
        }
      }

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
