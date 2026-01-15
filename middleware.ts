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

export default withAuth(
  function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    // Allow Inngest to access its endpoint without auth/cookies
    if (pathname.startsWith("/api/inngest")) {
      return NextResponse.next()
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
    "/api/tasks/:path*",
    "/api/email-drafts/:path*",
    "/api/email-accounts/:path*",
    "/api/oauth/:path*",
    "/api/webhooks/:path*",
    "/api/auth/:path*",
    "/api/tracking/:path*",
  ],
}

