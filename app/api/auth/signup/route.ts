/**
 * POST /api/auth/signup
 * Self-service signup - creates a new organization and admin user
 * Sends verification email
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { fireWebhook } from "@/lib/services/webhook.service"
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
    const { email, password, firstName, lastName, name, website, _t } = body

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

    // Derive company name from email domain (e.g. john@acme-corp.com → "Acme Corp")
    const emailDomain = normalizedEmail.split("@")[1]?.split(".")[0] || "My Company"
    const trimmedCompanyName = emailDomain
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())

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

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create organization, admin user, and starter data in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: trimmedCompanyName,
          slug,
          trialStartedAt: new Date(),
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
          emailVerified: true,
        }
      })

      // Create the user as a contact/stakeholder (so they can send requests to themselves)
      await tx.entity.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          contactType: "EMPLOYEE",
          organizationId: organization.id
        }
      })

      // TODO: Remove debug user creation before production release.
      // This block creates debug users with known passwords for development/testing.
      // It is gated behind ENABLE_DEBUG_USERS env var but should be removed entirely
      // once the team no longer needs it for local development.
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

      return { organization, user }
    })

    console.log(`[Signup] New organization created: ${result.organization.name} (${result.organization.id})`)

    // Fire webhook for external integrations (e.g. n8n → HubSpot)
    fireWebhook("user.signup", {
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: trimmedCompanyName,
      role: "ADMIN",
      organizationId: result.organization.id,
    })

    return NextResponse.json({
      success: true,
      message: "Account created! Please check your email to verify your account.",
      emailSent: true,
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
