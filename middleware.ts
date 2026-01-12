import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default withAuth(
  function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    // Allow Inngest to access its endpoint without auth/cookies
    if (pathname.startsWith("/api/inngest")) {
      return NextResponse.next()
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname
        if (pathname.startsWith("/api/inngest")) {
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
  ],
}

