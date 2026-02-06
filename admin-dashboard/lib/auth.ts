import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const ADMIN_COOKIE = "vergo_admin_auth"

export function isAuthenticated(): boolean {
  const cookieStore = cookies()
  const token = cookieStore.get(ADMIN_COOKIE)
  return token?.value === "authenticated"
}

export function requireAuth() {
  if (!isAuthenticated()) {
    redirect("/login")
  }
}

export function verifyPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    console.warn("[Admin] ADMIN_PASSWORD not set - denying all access")
    return false
  }
  return password === adminPassword
}
