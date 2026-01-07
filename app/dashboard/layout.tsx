import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import React from "react"
import { UserMenu } from "@/components/user-menu"
import { debugLog } from "@/lib/debug-logger"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // #region agent log
  debugLog({location:'app/dashboard/layout.tsx:14',message:'DashboardLayout: function entry',data:{hasAuthOptions:!!authOptions,hasChildren:!!children},hypothesisId:'B'})
  // #endregion
  
  // #region agent log
  debugLog({location:'app/dashboard/layout.tsx:17',message:'DashboardLayout: before getServerSession',data:{},hypothesisId:'B'})
  // #endregion
  
  let session
  try {
    session = await getServerSession(authOptions)
    // #region agent log
    debugLog({location:'app/dashboard/layout.tsx:23',message:'DashboardLayout: getServerSession success',data:{hasSession:!!session,hasUser:!!session?.user,userEmail:session?.user?.email},hypothesisId:'B'})
    // #endregion
  } catch (error: any) {
    // #region agent log
    debugLog({location:'app/dashboard/layout.tsx:27',message:'DashboardLayout: getServerSession error',data:{errorName:error?.name,errorMessage:error?.message,errorCode:error?.code,errorStack:error?.stack?.substring(0,300)},hypothesisId:'B'})
    // #endregion
    // Log full error for debugging
    console.error('[DashboardLayout] getServerSession error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    // Don't throw - redirect to signin instead
    // #region agent log
    debugLog({location:'app/dashboard/layout.tsx:31',message:'DashboardLayout: error caught, redirecting to signin',data:{},hypothesisId:'B'})
    // #endregion
    redirect("/auth/signin")
  }

  if (!session) {
    // #region agent log
    debugLog({location:'app/dashboard/layout.tsx:36',message:'DashboardLayout: no session, redirecting',data:{},hypothesisId:'D'})
    // #endregion
    redirect("/auth/signin")
  }
  
  // #region agent log
  debugLog({location:'app/dashboard/layout.tsx:41',message:'DashboardLayout: rendering layout',data:{hasSession:!!session},hypothesisId:'B'})
  // #endregion

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 flex-shrink-0 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard/inbox" className="flex-shrink-0">
              <h1 className="text-xl font-bold cursor-pointer hover:text-gray-700 transition-colors">
                Vergo Inbox
              </h1>
            </Link>
          </div>
          <div className="flex items-center">
            <UserMenu userEmail={session.user.email || ""} />
          </div>
        </div>
      </nav>
      <main className="flex-1 bg-gray-50">
        {children}
      </main>
    </div>
  )
}

