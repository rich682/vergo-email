import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Skip auth check for login page and auth API
  const path = request.nextUrl.pathname
  if (path === "/login" || path.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("vergo_admin_auth")
  if (authCookie?.value !== "authenticated") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
