import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}${random}`
}

/**
 * Routes that require ADMIN role
 */
const ADMIN_ONLY_ROUTES = [
  "/dashboard/settings/team",
  "/dashboard/settings",
  "/dashboard/databases",
  "/dashboard/contacts",
  "/dashboard/collection",
  "/dashboard/requests",
  "/api/org/settings",
  // Note: /api/org/users is NOT admin-only - it returns filtered data (non-admins only see themselves)
  "/api/org/team",
  "/api/reports", // Report definitions (templates) are admin-only
  "/api/databases",
  "/api/contacts",
  "/api/collection",
  "/api/requests",
]

/**
 * Check if a path matches any admin-only route
 */
function isAdminOnlyRoute(pathname: string): boolean {
  for (const adminRoute of ADMIN_ONLY_ROUTES) {
    if (pathname === adminRoute || pathname.startsWith(adminRoute + "/")) {
      return true
    }
  }
  return false
}

export default withAuth(
  function middleware(req: NextRequest & { nextauth: { token: any } }) {
    const { pathname } = req.nextUrl
    const token = req.nextauth?.token

    // Allow Inngest to access its endpoint without auth/cookies
    if (pathname.startsWith("/api/inngest")) {
      return NextResponse.next()
    }

    // Check role-based access for admin-only routes
    if (isAdminOnlyRoute(pathname)) {
      const role = token?.role as string | undefined
      if (role?.toUpperCase() !== "ADMIN") {
        // For API routes, return 403 Forbidden
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Forbidden - Admin access required" },
            { status: 403 }
          )
        }
        // For dashboard routes, redirect to jobs page
        return NextResponse.redirect(new URL("/dashboard/jobs", req.url))
      }
    }

    // Generate and attach request ID for tracing
    const requestId = req.headers.get("x-request-id") || generateRequestId()
    const response = NextResponse.next()
    response.headers.set("x-request-id", requestId)

    return response
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname
        
        // Allow Inngest without auth
        if (pathname.startsWith("/api/inngest")) {
          return true
        }
        
        // Allow public auth endpoints
        if (pathname.startsWith("/api/auth/")) {
          return true
        }
        
        // Allow tracking pixel
        if (pathname.startsWith("/api/tracking/")) {
          return true
        }
        
        // Allow webhooks
        if (pathname.startsWith("/api/webhooks/")) {
          return true
        }
        
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/requests/detail/:path*",
    "/api/email-drafts/:path*",
    "/api/email-accounts/:path*",
    "/api/oauth/:path*",
    "/api/webhooks/:path*",
    "/api/auth/:path*",
    "/api/tracking/:path*",
    "/api/org/:path*",
  ],
}
