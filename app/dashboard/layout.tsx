import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import React from "react"
import { UserMenu } from "@/components/user-menu"
import { Sidebar } from "@/components/sidebar"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let session
  try {
    session = await getServerSession(authOptions)
  } catch (error: any) {
    console.error('[DashboardLayout] getServerSession error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    redirect("/auth/signin")
  }

  if (!session) {
    redirect("/auth/signin")
  }

  // Get org name from session if available
  const orgName = (session.user as any)?.organizationName || undefined

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main content area - offset by sidebar width (w-20 = 5rem = 80px) */}
      <div className="pl-20">
        {/* Top header bar */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-end px-6">
          {/* Notification bell could go here */}
          <div className="flex items-center gap-4">
            {/* Notification icon placeholder */}
            <button className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            
            {/* User menu */}
            <UserMenu 
              userEmail={session.user.email || ""} 
              userName={session.user.name || undefined}
              userRole={(session.user as any).role || undefined}
              orgName={orgName}
            />
          </div>
        </header>
        
        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
