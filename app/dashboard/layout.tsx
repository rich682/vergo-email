import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import React from "react"
import { UserMenu } from "@/components/user-menu"
import { NavLinks } from "@/components/nav-links"

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
    // Log full error for debugging
    console.error('[DashboardLayout] getServerSession error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    // Don't throw - redirect to signin instead
    redirect("/auth/signin")
  }

  if (!session) {
    redirect("/auth/signin")
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 flex-shrink-0 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/dashboard/requests" className="flex-shrink-0">
              <h1 className="text-xl font-bold cursor-pointer hover:text-gray-700 transition-colors">
                Vergo Inbox
              </h1>
            </Link>
            <NavLinks />
          </div>
          <div className="flex items-center">
            <UserMenu 
              userEmail={session.user.email || ""} 
              userName={session.user.name || undefined}
            />
          </div>
        </div>
      </nav>
      <main className="flex-1 bg-gray-50">
        {children}
      </main>
    </div>
  )
}
