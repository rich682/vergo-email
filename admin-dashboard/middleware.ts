import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Skip auth for public pages and all API auth routes
  if (PUBLIC_PATHS.some((p) => path === p) || path.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Check for auth cookie (now contains a JWT)
  const authCookie = request.cookies.get("vergo_admin_auth")
  if (!authCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Basic JWT structure check (3 dot-separated parts)
  // Full verification happens server-side in requireAuth()
  const parts = authCookie.value.split(".")
  if (parts.length !== 3) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
