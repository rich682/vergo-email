import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()
const ADMIN_COOKIE = "vergo_admin_auth"

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || "fallback-dev-secret"
}

export interface AdminPayload {
  id: string
  email: string
  name: string | null
}

export function signToken(payload: AdminPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" })
}

export function verifyToken(token: string): AdminPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AdminPayload
  } catch {
    return null
  }
}

export function getCurrentAdmin(): AdminPayload | null {
  const cookieStore = cookies()
  const token = cookieStore.get(ADMIN_COOKIE)
  if (!token?.value) return null
  return verifyToken(token.value)
}

export function isAuthenticated(): boolean {
  return getCurrentAdmin() !== null
}

export function requireAuth(): AdminPayload {
  const admin = getCurrentAdmin()
  if (!admin) redirect("/login")
  return admin
}

export async function verifyPassword(email: string, password: string): Promise<AdminPayload | null> {
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } })
  if (!user || !user.passwordHash || !user.emailVerified) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return { id: user.id, email: user.email, name: user.name }
}

export { ADMIN_COOKIE }
