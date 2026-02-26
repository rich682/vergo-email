import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { canAccessRoute } from "@/lib/permissions"
import type { OrgActionPermissions } from "@/lib/permissions"

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}${random}`
}

export default withAuth(
  function middleware(req: NextRequest & { nextauth: { token: any } }) {
    const { pathname } = req.nextUrl
    const token = req.nextauth?.token

    // Allow Inngest to access its endpoint without auth/cookies
    if (pathname.startsWith("/api/inngest")) {
      return NextResponse.next()
    }

    // Check role-based access via action permissions
    const role = token?.role as string | undefined
    const orgActionPermissions = (token?.orgActionPermissions as OrgActionPermissions) || null

    if (!canAccessRoute(role, pathname, orgActionPermissions)) {
      // For API routes, return 403 Forbidden
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        )
      }
      // For dashboard routes, redirect to boards page
      return NextResponse.redirect(new URL("/dashboard/boards", req.url))
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

        // Allow token-based form access (external stakeholders without accounts)
        if (pathname.startsWith("/api/form-requests/token/")) {
          return true
        }

        // Allow form attachment uploads/downloads (token validated at route level)
        if (/^\/api\/form-requests\/[^/]+\/attachments/.test(pathname)) {
          return true
        }

        // Allow error reporting (must work even during auth failures)
        if (pathname.startsWith("/api/errors/")) {
          return true
        }

        // Allow public template downloads
        if (pathname.startsWith("/api/templates/")) {
          return true
        }

        // Allow task import template download
        if (pathname === "/api/task-instances/template") {
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
    "/api/:path*",
  ],
}
